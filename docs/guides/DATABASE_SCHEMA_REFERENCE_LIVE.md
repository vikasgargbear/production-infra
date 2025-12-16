# Database Schema Reference

> **Auto-generated from database on 2025-12-15 17:08:49**
> This documentation is extracted directly from the production database schema.

## Table of Contents

- [master](#master)
  - [addresses](#masteraddresses)
  - [branches](#masterbranches)
  - [currencies](#mastercurrencies)
  - [departments](#masterdepartments)
  - [doctors](#masterdoctors)
  - [employees](#masteremployees)
  - [exchange_rates](#masterexchange_rates)
  - [number_series](#masternumber_series)
  - [org_bank_accounts](#masterorg_bank_accounts)
  - [org_branches](#masterorg_branches)
  - [org_users](#masterorg_users)
  - [organizations](#masterorganizations)
  - [roles](#masterroles)
  - [system_settings](#mastersystem_settings)
- [parties](#parties)
  - [customer_contacts](#partiescustomer_contacts)
  - [customer_group_members](#partiescustomer_group_members)
  - [customer_groups](#partiescustomer_groups)
  - [customers](#partiescustomers)
  - [routes](#partiesroutes)
  - [supplier_contacts](#partiessupplier_contacts)
  - [suppliers](#partiessuppliers)
  - [territories](#partiesterritories)
- [inventory](#inventory)
  - [batches](#inventorybatches)
  - [competitor_pricing](#inventorycompetitor_pricing)
  - [inventory_movements](#inventoryinventory_movements)
  - [location_wise_stock](#inventorylocation_wise_stock)
  - [movement_summary](#inventorymovement_summary)
  - [price_alerts](#inventoryprice_alerts)
  - [price_change_log](#inventoryprice_change_log)
  - [price_history](#inventoryprice_history)
  - [product_categories](#inventoryproduct_categories)
  - [product_types](#inventoryproduct_types)
  - [products](#inventoryproducts)
  - [reorder_suggestions](#inventoryreorder_suggestions)
  - [stock_reservations](#inventorystock_reservations)
  - [stock_transfer_items](#inventorystock_transfer_items)
  - [stock_transfers](#inventorystock_transfers)
  - [storage_locations](#inventorystorage_locations)
  - [units_of_measure](#inventoryunits_of_measure)
- [sales](#sales)
  - [credit_note_applications](#salescredit_note_applications)
  - [credit_notes](#salescredit_notes)
  - [customer_visits](#salescustomer_visits)
  - [debit_notes](#salesdebit_notes)
  - [delivery_challan_items](#salesdelivery_challan_items)
  - [delivery_challans](#salesdelivery_challans)
  - [delivery_tracking](#salesdelivery_tracking)
  - [eway_bills](#saleseway_bills)
  - [invoice_items](#salesinvoice_items)
  - [invoice_return_status](#salesinvoice_return_status)
  - [invoices](#salesinvoices)
  - [loyalty_programs](#salesloyalty_programs)
  - [loyalty_tiers](#salesloyalty_tiers)
  - [loyalty_transactions](#salesloyalty_transactions)
  - [order_items](#salesorder_items)
  - [orders](#salesorders)
  - [price_list_items](#salesprice_list_items)
  - [price_lists](#salesprice_lists)
  - [promotional_schemes](#salespromotional_schemes)
  - [proof_of_delivery](#salesproof_of_delivery)
  - [sales_return_items](#salessales_return_items)
  - [sales_returns](#salessales_returns)
  - [sales_schemes](#salessales_schemes)
  - [sales_targets](#salessales_targets)
  - [scheme_customers](#salesscheme_customers)
  - [scheme_products](#salesscheme_products)
  - [scheme_usage](#salesscheme_usage)
  - [scheme_volume_slabs](#salesscheme_volume_slabs)
  - [v_invoice_calculation_debug](#salesv_invoice_calculation_debug)
  - [v_invoice_items_with_quantities](#salesv_invoice_items_with_quantities)
- [procurement](#procurement)
  - [branch_budgets](#procurementbranch_budgets)
  - [goods_receipt_notes](#procurementgoods_receipt_notes)
  - [grn_items](#procurementgrn_items)
  - [grn_return_status](#procurementgrn_return_status)
  - [purchase_order_items](#procurementpurchase_order_items)
  - [purchase_orders](#procurementpurchase_orders)
  - [purchase_requisition_items](#procurementpurchase_requisition_items)
  - [purchase_requisitions](#procurementpurchase_requisitions)
  - [purchase_return_items](#procurementpurchase_return_items)
  - [purchase_returns](#procurementpurchase_returns)
  - [supplier_invoice_items](#procurementsupplier_invoice_items)
  - [supplier_invoice_return_status](#procurementsupplier_invoice_return_status)
  - [supplier_invoices](#procurementsupplier_invoices)
  - [supplier_quotation_items](#procurementsupplier_quotation_items)
  - [supplier_quotations](#procurementsupplier_quotations)
  - [vendor_performance](#procurementvendor_performance)
- [financial](#financial)
  - [bank_reconciliation_items](#financialbank_reconciliation_items)
  - [bank_reconciliations](#financialbank_reconciliations)
  - [cash_flow_forecast](#financialcash_flow_forecast)
  - [chart_of_accounts](#financialchart_of_accounts)
  - [customer_outstanding](#financialcustomer_outstanding)
  - [expense_categories](#financialexpense_categories)
  - [expense_claim_items](#financialexpense_claim_items)
  - [expense_claims](#financialexpense_claims)
  - [journal_entries](#financialjournal_entries)
  - [journal_entry_lines](#financialjournal_entry_lines)
  - [payment_allocations](#financialpayment_allocations)
  - [payment_methods](#financialpayment_methods)
  - [payments](#financialpayments)
  - [pdc_management](#financialpdc_management)
  - [supplier_outstanding](#financialsupplier_outstanding)
  - [unmatched_transactions](#financialunmatched_transactions)
- [gst](#gst)
  - [advance_receipts](#gstadvance_receipts)
  - [compliance_calendar](#gstcompliance_calendar)
  - [eway_bills](#gsteway_bills)
  - [gst_audit_trail](#gstgst_audit_trail)
  - [gst_credit_ledger](#gstgst_credit_ledger)
  - [gst_liability](#gstgst_liability)
  - [gst_rates](#gstgst_rates)
  - [gst_reconciliation](#gstgst_reconciliation)
  - [gstr1_data](#gstgstr1_data)
  - [gstr2a_data](#gstgstr2a_data)
  - [gstr2b_data](#gstgstr2b_data)
  - [gstr3b_data](#gstgstr3b_data)
  - [hsn_sac_codes](#gsthsn_sac_codes)
  - [purchase_reconciliation](#gstpurchase_reconciliation)
  - [return_filing_status](#gstreturn_filing_status)
- [compliance](#compliance)
  - [compliance_alerts](#compliancecompliance_alerts)
  - [compliance_audits](#compliancecompliance_audits)
  - [compliance_documents](#compliancecompliance_documents)
  - [compliance_violations](#compliancecompliance_violations)
  - [corrective_action_plans](#compliancecorrective_action_plans)
  - [corrective_actions](#compliancecorrective_actions)
  - [destruction_approvals](#compliancedestruction_approvals)
  - [drug_licenses](#compliancedrug_licenses)
  - [environmental_breaches](#complianceenvironmental_breaches)
  - [environmental_compliance](#complianceenvironmental_compliance)
  - [expired_destructions](#complianceexpired_destructions)
  - [inspection_schedule](#complianceinspection_schedule)
  - [inspector_visits](#complianceinspector_visits)
  - [license_renewal_history](#compliancelicense_renewal_history)
  - [license_types](#compliancelicense_types)
  - [narcotic_discrepancies](#compliancenarcotic_discrepancies)
  - [narcotic_register](#compliancenarcotic_register)
  - [org_compliance_status](#complianceorg_compliance_status)
  - [org_licenses](#complianceorg_licenses)
  - [pharmacist_registrations](#compliancepharmacist_registrations)
  - [product_recalls](#complianceproduct_recalls)
  - [quality_control_tests](#compliancequality_control_tests)
  - [quality_deviations](#compliancequality_deviations)
  - [regulatory_authorities](#complianceregulatory_authorities)
  - [regulatory_inspections](#complianceregulatory_inspections)
  - [required_licenses](#compliancerequired_licenses)
  - [temperature_logs](#compliancetemperature_logs)
  - [temperature_zones](#compliancetemperature_zones)
- [analytics](#analytics)
  - [alert_definitions](#analyticsalert_definitions)
  - [alert_history](#analyticsalert_history)
  - [dashboard_cache](#analyticsdashboard_cache)
  - [dashboard_widgets](#analyticsdashboard_widgets)
  - [dashboards](#analyticsdashboards)
  - [data_quality_metrics](#analyticsdata_quality_metrics)
  - [kpi_definitions](#analyticskpi_definitions)
  - [kpi_values](#analyticskpi_values)
  - [product_consumption_stats](#analyticsproduct_consumption_stats)
  - [report_execution_history](#analyticsreport_execution_history)
  - [report_schedules](#analyticsreport_schedules)
  - [report_templates](#analyticsreport_templates)
  - [user_activity_analytics](#analyticsuser_activity_analytics)
- [system_config](#system_config)
  - [api_logs](#system_configapi_logs)
  - [api_usage_log](#system_configapi_usage_log)
  - [api_usage_log_2024_01](#system_configapi_usage_log_2024_01)
  - [api_usage_log_2024_02](#system_configapi_usage_log_2024_02)
  - [audit_logs](#system_configaudit_logs)
  - [backup_history](#system_configbackup_history)
  - [configuration_history](#system_configconfiguration_history)
  - [email_templates](#system_configemail_templates)
  - [error_logs](#system_configerror_logs)
  - [feature_flags](#system_configfeature_flags)
  - [integration_logs](#system_configintegration_logs)
  - [job_execution_history](#system_configjob_execution_history)
  - [scheduled_jobs](#system_configscheduled_jobs)
  - [scheduled_notifications](#system_configscheduled_notifications)
  - [setting_definitions](#system_configsetting_definitions)
  - [system_health_metrics](#system_configsystem_health_metrics)
  - [system_integrations](#system_configsystem_integrations)
  - [system_notifications](#system_configsystem_notifications)
  - [system_settings](#system_configsystem_settings)
  - [user_notifications](#system_configuser_notifications)
  - [workflow_definitions](#system_configworkflow_definitions)
  - [workflow_instances](#system_configworkflow_instances)
- [public](#public)
  - [document_number_sequences](#publicdocument_number_sequences)

---

## Schema Overview

| Schema | Tables | Description |
|--------|--------|-------------|
| `master` | 14 | Core organizational and configuration data |
| `parties` | 8 | Customers, suppliers, and business partners |
| `inventory` | 17 | Product, batch, stock, and warehouse management |
| `sales` | 30 | Orders, invoices, deliveries, and sales returns |
| `procurement` | 16 | Purchase orders, goods receipts, and supplier management |
| `financial` | 16 | Accounting, payments, banking, and financial reporting |
| `gst` | 15 | GST compliance, returns, and tax management |
| `compliance` | 28 | Licenses, inspections, and regulatory compliance |
| `analytics` | 13 | Business intelligence, KPIs, and reporting |
| `system_config` | 22 | System settings, integrations, and monitoring |
| `public` | 1 | Shared functions and utilities |

---

## master

**Tables:** `addresses`, `branches`, `currencies`, `departments`, `doctors`, `employees`, `exchange_rates`, `number_series`, `org_bank_accounts`, `org_branches`, `org_users`, `organizations`, `roles`, `system_settings`

### master.addresses

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `address_id` | INTEGER(32) | PK | NO | nextval('master.addresses_a... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `entity_type` | TEXT |  | NO |  |  |
| `entity_id` | INTEGER(32) |  | NO |  |  |
| `address_type` | TEXT |  | NO |  |  |
| `address_line1` | TEXT |  | NO |  |  |
| `address_line2` | TEXT |  | YES |  |  |
| `landmark` | TEXT |  | YES |  |  |
| `city` | TEXT |  | NO |  |  |
| `state_code` | TEXT |  | NO |  |  |
| `state_name` | TEXT |  | NO |  |  |
| `country` | TEXT |  | YES | 'India'::text |  |
| `pincode` | TEXT |  | NO |  |  |
| `latitude` | NUMERIC(10,8) |  | YES |  |  |
| `longitude` | NUMERIC(11,8) |  | YES |  |  |
| `google_plus_code` | TEXT |  | YES |  |  |
| `contact_person` | TEXT |  | YES |  |  |
| `contact_number` | TEXT |  | YES |  |  |
| `contact_email` | TEXT |  | YES |  |  |
| `delivery_instructions` | TEXT |  | YES |  |  |
| `is_default` | BOOLEAN |  | YES | false |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### master.branches

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `branch_id` | INTEGER(32) |  | YES |  |  |
| `org_id` | UUID |  | YES |  |  |
| `branch_code` | TEXT |  | YES |  |  |
| `branch_name` | TEXT |  | YES |  |  |
| `branch_type` | TEXT |  | YES |  |  |
| `address` | JSONB |  | YES |  |  |
| `google_maps_link` | TEXT |  | YES |  |  |
| `latitude` | NUMERIC(10,8) |  | YES |  |  |
| `longitude` | NUMERIC(11,8) |  | YES |  |  |
| `branch_phone` | TEXT |  | YES |  |  |
| `branch_email` | TEXT |  | YES |  |  |
| `branch_manager_id` | INTEGER(32) |  | YES |  |  |
| `branch_gst_number` | TEXT |  | YES |  |  |
| `drug_license_number` | TEXT |  | YES |  |  |
| `drug_license_validity` | DATE |  | YES |  |  |
| `is_billing_location` | BOOLEAN |  | YES |  |  |
| `is_shipping_location` | BOOLEAN |  | YES |  |  |
| `is_default_location` | BOOLEAN |  | YES |  |  |
| `storage_capacity` | JSONB |  | YES |  |  |
| `working_hours` | JSONB |  | YES |  |  |
| `holidays` | JSONB |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES |  |  |
| `operational_since` | DATE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |

### master.currencies

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `currency_id` | INTEGER(32) | PK | NO | nextval('master.currencies_... |  |
| `currency_code` | TEXT |  | NO |  |  |
| `currency_name` | TEXT |  | NO |  |  |
| `currency_symbol` | TEXT |  | NO |  |  |
| `decimal_places` | INTEGER(32) |  | YES | 2 |  |
| `decimal_separator` | TEXT |  | YES | '.'::text |  |
| `thousand_separator` | TEXT |  | YES | ','::text |  |
| `symbol_position` | TEXT |  | YES | 'before'::text |  |
| `format_pattern` | TEXT |  | YES |  |  |
| `is_base_currency` | BOOLEAN |  | YES | false |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### master.departments

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `department_id` | INTEGER(32) | PK | NO | nextval('master.departments... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `department_code` | TEXT |  | NO |  |  |
| `department_name` | TEXT |  | NO |  |  |
| `department_type` | TEXT |  | YES |  |  |
| `parent_department_id` | INTEGER(32) | FK→departments | YES |  |  |
| `department_head_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `cost_center_code` | TEXT |  | YES |  |  |
| `budget_allocated` | NUMERIC(15,2) |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### master.doctors

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `doctor_id` | INTEGER(32) | PK | NO | nextval('master.doctors_doc... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `doctor_code` | TEXT |  | NO |  |  |
| `doctor_name` | TEXT |  | NO |  |  |
| `qualification` | TEXT |  | YES |  |  |
| `specialization` | TEXT |  | YES |  |  |
| `registration_number` | TEXT |  | YES |  |  |
| `clinic_name` | TEXT |  | YES |  |  |
| `clinic_address` | JSONB |  | YES |  |  |
| `phone_numbers` | ARRAY |  | YES |  |  |
| `email` | TEXT |  | YES |  |  |
| `years_of_practice` | INTEGER(32) |  | YES |  |  |
| `associated_hospitals` | ARRAY |  | YES |  |  |
| `commission_rate` | NUMERIC(5,2) |  | YES |  |  |
| `credit_limit` | NUMERIC(15,2) |  | YES |  |  |
| `payment_terms_days` | INTEGER(32) |  | YES | 30 |  |
| `preferred_brands` | ARRAY |  | YES |  |  |
| `prescription_pattern` | JSONB |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `blacklisted` | BOOLEAN |  | YES | false |  |
| `blacklist_reason` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### master.employees

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `employee_id` | INTEGER(32) | PK | NO | nextval('master.employees_e... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `employee_code` | TEXT |  | NO |  |  |
| `first_name` | TEXT |  | NO |  |  |
| `last_name` | TEXT |  | YES |  |  |
| `full_name` | TEXT |  | YES |  |  |
| `date_of_birth` | DATE |  | YES |  |  |
| `gender` | TEXT |  | YES |  |  |
| `marital_status` | TEXT |  | YES |  |  |
| `blood_group` | TEXT |  | YES |  |  |
| `personal_email` | TEXT |  | YES |  |  |
| `personal_mobile` | TEXT |  | NO |  |  |
| `emergency_contact` | JSONB |  | YES |  |  |
| `permanent_address` | JSONB |  | YES |  |  |
| `current_address` | JSONB |  | YES |  |  |
| `designation` | TEXT |  | NO |  |  |
| `department_id` | INTEGER(32) | FK→departments | YES |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | YES |  |  |
| `joining_date` | DATE |  | NO |  |  |
| `probation_end_date` | DATE |  | YES |  |  |
| `confirmation_date` | DATE |  | YES |  |  |
| `pan_number` | TEXT |  | YES |  |  |
| `aadhar_number` | TEXT |  | YES |  |  |
| `driving_license` | TEXT |  | YES |  |  |
| `passport_number` | TEXT |  | YES |  |  |
| `bank_account_details` | JSONB |  | YES |  |  |
| `employment_status` | TEXT |  | YES | 'active'::text |  |
| `resignation_date` | DATE |  | YES |  |  |
| `last_working_date` | DATE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### master.exchange_rates

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `rate_id` | INTEGER(32) | PK | NO | nextval('master.exchange_ra... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `from_currency_code` | TEXT |  | NO |  |  |
| `to_currency_code` | TEXT |  | NO |  |  |
| `exchange_rate` | NUMERIC(15,6) |  | NO |  |  |
| `inverse_rate` | NUMERIC(15,6) |  | YES |  |  |
| `effective_from` | DATE |  | NO |  |  |
| `effective_until` | DATE |  | YES |  |  |
| `rate_source` | TEXT |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |

### master.number_series

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `series_id` | INTEGER(32) | PK | NO | nextval('master.number_seri... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | YES |  |  |
| `document_type` | TEXT |  | NO |  |  |
| `series_code` | TEXT |  | NO |  |  |
| `series_description` | TEXT |  | YES |  |  |
| `prefix` | TEXT |  | YES |  |  |
| `suffix` | TEXT |  | YES |  |  |
| `separator` | TEXT |  | YES | '/'::text |  |
| `current_number` | INTEGER(32) |  | NO | 0 |  |
| `start_number` | INTEGER(32) |  | NO | 1 |  |
| `increment_by` | INTEGER(32) |  | NO | 1 |  |
| `reset_frequency` | TEXT |  | YES |  |  |
| `last_reset_date` | DATE |  | YES |  |  |
| `preview_format` | TEXT |  | YES |  |  |
| `is_default` | BOOLEAN |  | YES | false |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### master.org_bank_accounts

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `bank_account_id` | INTEGER(32) | PK | NO | nextval('master.org_bank_ac... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | YES |  |  |
| `account_name` | TEXT |  | NO |  |  |
| `account_number` | TEXT |  | NO |  |  |
| `account_type` | TEXT |  | NO |  |  |
| `bank_name` | TEXT |  | NO |  |  |
| `branch_name` | TEXT |  | NO |  |  |
| `ifsc_code` | TEXT |  | NO |  |  |
| `swift_code` | TEXT |  | YES |  |  |
| `bank_address` | JSONB |  | YES |  |  |
| `bank_contact_number` | TEXT |  | YES |  |  |
| `relationship_manager` | TEXT |  | YES |  |  |
| `currency_code` | TEXT |  | YES | 'INR'::text |  |
| `overdraft_limit` | NUMERIC(15,2) |  | YES |  |  |
| `is_default_account` | BOOLEAN |  | YES | false |  |
| `is_payment_account` | BOOLEAN |  | YES | true |  |
| `is_receipt_account` | BOOLEAN |  | YES | true |  |
| `last_reconciled_date` | DATE |  | YES |  |  |
| `last_statement_date` | DATE |  | YES |  |  |
| `current_balance` | NUMERIC(15,2) |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `account_opened_date` | DATE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### master.org_branches

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `branch_id` | INTEGER(32) | PK | NO | nextval('master.org_branche... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_code` | TEXT |  | NO |  |  |
| `branch_name` | TEXT |  | NO |  |  |
| `branch_type` | TEXT |  | NO | 'warehouse'::text |  |
| `address` | JSONB |  | NO |  |  |
| `google_maps_link` | TEXT |  | YES |  |  |
| `latitude` | NUMERIC(10,8) |  | YES |  |  |
| `longitude` | NUMERIC(11,8) |  | YES |  |  |
| `branch_phone` | TEXT |  | YES |  |  |
| `branch_email` | TEXT |  | YES |  |  |
| `branch_manager_id` | INTEGER(32) |  | YES |  |  |
| `branch_gst_number` | TEXT |  | YES |  |  |
| `drug_license_number` | TEXT |  | YES |  |  |
| `drug_license_validity` | DATE |  | YES |  |  |
| `is_billing_location` | BOOLEAN |  | YES | false |  |
| `is_shipping_location` | BOOLEAN |  | YES | true |  |
| `is_default_location` | BOOLEAN |  | YES | false |  |
| `storage_capacity` | JSONB |  | YES |  |  |
| `working_hours` | JSONB |  | YES |  |  |
| `holidays` | JSONB |  | YES | '[]'::jsonb |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `operational_since` | DATE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### master.org_users

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `user_id` | INTEGER(32) | PK | NO | nextval('master.org_users_u... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `auth_user_id` | UUID |  | YES |  |  |
| `username` | TEXT |  | NO |  |  |
| `email` | TEXT |  | NO |  |  |
| `mobile_number` | TEXT |  | NO |  |  |
| `employee_code` | TEXT |  | YES |  |  |
| `first_name` | TEXT |  | NO |  |  |
| `last_name` | TEXT |  | YES |  |  |
| `full_name` | TEXT |  | YES |  |  |
| `role_id` | INTEGER(32) |  | YES |  |  |
| `is_admin` | BOOLEAN |  | YES | false |  |
| `permissions` | JSONB |  | YES | '{}'::jsonb |  |
| `branch_ids` | ARRAY |  | YES | '{}'::integer[] |  |
| `department_id` | INTEGER(32) |  | YES |  |  |
| `reporting_to_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `last_login` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `login_count` | INTEGER(32) |  | YES | 0 |  |
| `failed_login_attempts` | INTEGER(32) |  | YES | 0 |  |
| `locked_until` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `ui_preferences` | JSONB |  | YES | '{}'::jsonb |  |
| `notification_preferences` | JSONB |  | YES | '{}'::jsonb |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `is_online` | BOOLEAN |  | YES | false |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `password_hash` | TEXT |  | YES |  |  |

### master.organizations

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `org_id` | UUID | PK | NO | gen_random_uuid() |  |
| `org_code` | TEXT |  | NO |  |  |
| `org_name` | TEXT |  | NO |  |  |
| `legal_name` | TEXT |  | NO |  |  |
| `business_type` | TEXT |  | NO | 'pharmaceutical_distributor... |  |
| `establishment_date` | DATE |  | YES |  |  |
| `gst_number` | TEXT |  | YES |  |  |
| `pan_number` | TEXT |  | YES |  |  |
| `drug_license_number` | TEXT |  | YES |  |  |
| `drug_license_validity` | DATE |  | YES |  |  |
| `fssai_number` | TEXT |  | YES |  |  |
| `registered_address` | JSONB |  | NO |  |  |
| `correspondence_address` | JSONB |  | YES |  |  |
| `contact_numbers` | JSONB |  | YES |  |  |
| `email_addresses` | JSONB |  | YES |  |  |
| `website` | TEXT |  | YES |  |  |
| `financial_year_start` | INTEGER(32) |  | YES | 4 |  |
| `currency_code` | TEXT |  | YES | 'INR'::text |  |
| `date_format` | TEXT |  | YES | 'DD/MM/YYYY'::text |  |
| `time_zone` | TEXT |  | YES | 'Asia/Kolkata'::text |  |
| `subscription_plan` | TEXT |  | YES | 'standard'::text |  |
| `subscription_status` | TEXT |  | YES | 'active'::text |  |
| `subscription_valid_until` | DATE |  | YES |  |  |
| `user_limit` | INTEGER(32) |  | YES | 10 |  |
| `branch_limit` | INTEGER(32) |  | YES | 1 |  |
| `business_settings` | JSONB |  | YES | '{}'::jsonb |  |
| `feature_flags` | JSONB |  | YES | '{}'::jsonb |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `is_verified` | BOOLEAN |  | YES | false |  |
| `verified_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | UUID |  | YES |  |  |

### master.roles

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `role_id` | INTEGER(32) | PK | NO | nextval('master.roles_role_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `role_code` | TEXT |  | NO |  |  |
| `role_name` | TEXT |  | NO |  |  |
| `role_description` | TEXT |  | YES |  |  |
| `parent_role_id` | INTEGER(32) | FK→roles | YES |  |  |
| `role_level` | INTEGER(32) |  | NO | 1 |  |
| `permissions` | JSONB |  | NO | '{}'::jsonb |  |
| `allowed_modules` | ARRAY |  | YES | '{}'::text[] |  |
| `restricted_features` | ARRAY |  | YES | '{}'::text[] |  |
| `data_access_level` | TEXT |  | YES | 'own'::text |  |
| `is_system_role` | BOOLEAN |  | YES | false |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### master.system_settings

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `setting_id` | INTEGER(32) | PK | NO | nextval('master.system_sett... |  |
| `org_id` | UUID |  | NO |  |  |
| `setting_category` | TEXT |  | NO |  |  |
| `setting_key` | TEXT |  | NO |  |  |
| `setting_value` | TEXT |  | NO |  |  |
| `setting_type` | TEXT |  | NO |  |  |
| `description` | TEXT |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

## parties

**Tables:** `customer_contacts`, `customer_group_members`, `customer_groups`, `customers`, `routes`, `supplier_contacts`, `suppliers`, `territories`

### parties.customer_contacts

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `contact_id` | INTEGER(32) | PK | NO | nextval('parties.customer_c... |  |
| `customer_id` | INTEGER(32) | FK→customers | NO |  |  |
| `contact_name` | TEXT |  | NO |  |  |
| `designation` | TEXT |  | YES |  |  |
| `department` | TEXT |  | YES |  |  |
| `mobile_number` | TEXT |  | YES |  |  |
| `phone_number` | TEXT |  | YES |  |  |
| `email` | TEXT |  | YES |  |  |
| `is_primary_contact` | BOOLEAN |  | YES | false |  |
| `contact_for` | ARRAY |  | YES |  |  |
| `preferred_contact_time` | TEXT |  | YES |  |  |
| `preferred_language` | TEXT |  | YES | 'English'::text |  |
| `date_of_birth` | DATE |  | YES |  |  |
| `anniversary_date` | DATE |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### parties.customer_group_members

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `member_id` | INTEGER(32) | PK | NO | nextval('parties.customer_g... |  |
| `group_id` | INTEGER(32) | FK→customer_groups | NO |  |  |
| `customer_id` | INTEGER(32) | FK→customers | NO |  |  |
| `joined_date` | DATE |  | NO | CURRENT_DATE |  |
| `expiry_date` | DATE |  | YES |  |  |
| `override_discount` | NUMERIC(5,2) |  | YES |  |  |
| `override_credit_limit` | NUMERIC(15,2) |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |

### parties.customer_groups

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `group_id` | INTEGER(32) | PK | NO | nextval('parties.customer_g... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `group_code` | TEXT |  | NO |  |  |
| `group_name` | TEXT |  | NO |  |  |
| `group_type` | TEXT |  | NO |  |  |
| `parent_group_id` | INTEGER(32) | FK→customer_groups | YES |  |  |
| `discount_percentage` | NUMERIC(5,2) |  | YES |  |  |
| `price_list_id` | INTEGER(32) |  | YES |  |  |
| `payment_terms_days` | INTEGER(32) |  | YES |  |  |
| `credit_limit_multiplier` | NUMERIC(3,2) |  | YES | 1.0 |  |
| `eligibility_criteria` | JSONB |  | YES | '{}'::jsonb |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### parties.customers

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `customer_id` | INTEGER(32) | PK | NO | nextval('parties.customers_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `customer_code` | TEXT |  | NO |  |  |
| `customer_name` | TEXT |  | NO |  |  |
| `customer_type` | TEXT |  | NO |  |  |
| `primary_phone` | TEXT |  | NO |  |  |
| `primary_email` | TEXT |  | YES |  |  |
| `secondary_phone` | TEXT |  | YES |  |  |
| `whatsapp_number` | TEXT |  | YES |  |  |
| `contact_person_name` | TEXT |  | YES |  |  |
| `contact_person_phone` | TEXT |  | YES |  |  |
| `contact_person_email` | TEXT |  | YES |  |  |
| `gst_number` | TEXT |  | YES |  |  |
| `pan_number` | TEXT |  | YES |  |  |
| `drug_license_number` | TEXT |  | YES |  |  |
| `drug_license_validity` | DATE |  | YES |  |  |
| `fssai_number` | TEXT |  | YES |  |  |
| `establishment_year` | INTEGER(32) |  | YES |  |  |
| `business_type` | TEXT |  | YES | 'retail_pharmacy'::text |  |
| `credit_limit` | NUMERIC(15,2) |  | YES | 0 |  |
| `current_outstanding` | NUMERIC(15,2) |  | YES | 0 |  |
| `credit_days` | INTEGER(32) |  | YES | 0 |  |
| `credit_rating` | TEXT |  | YES | 'C'::text |  |
| `payment_terms` | TEXT |  | YES | 'Cash'::text |  |
| `security_deposit` | NUMERIC(15,2) |  | YES | 0 |  |
| `overdue_interest_rate` | NUMERIC(5,2) |  | YES | 0 |  |
| `customer_category` | TEXT |  | YES |  |  |
| `customer_grade` | TEXT |  | YES |  |  |
| `territory_id` | INTEGER(32) |  | YES |  |  |
| `route_id` | INTEGER(32) |  | YES |  |  |
| `area_code` | TEXT |  | YES |  |  |
| `assigned_salesperson_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `price_list_id` | INTEGER(32) |  | YES |  |  |
| `discount_group_id` | INTEGER(32) |  | YES |  |  |
| `kyc_status` | TEXT |  | YES | 'pending'::text |  |
| `kyc_verified_date` | DATE |  | YES |  |  |
| `kyc_documents` | JSONB |  | YES | '[]'::jsonb |  |
| `preferred_payment_mode` | TEXT |  | YES |  |  |
| `preferred_delivery_time` | TEXT |  | YES |  |  |
| `prefer_sms` | BOOLEAN |  | YES | true |  |
| `prefer_email` | BOOLEAN |  | YES | false |  |
| `prefer_whatsapp` | BOOLEAN |  | YES | true |  |
| `first_transaction_date` | DATE |  | YES |  |  |
| `last_transaction_date` | DATE |  | YES |  |  |
| `total_business_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_transactions` | INTEGER(32) |  | YES | 0 |  |
| `average_order_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `blacklisted` | BOOLEAN |  | YES | false |  |
| `blacklist_reason` | TEXT |  | YES |  |  |
| `blacklist_date` | DATE |  | YES |  |  |
| `loyalty_points` | NUMERIC(15,2) |  | YES | 0 |  |
| `loyalty_tier` | TEXT |  | YES | 'bronze'::text |  |
| `internal_notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |

### parties.routes

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `route_id` | INTEGER(32) | PK | NO | nextval('parties.routes_rou... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `territory_id` | INTEGER(32) | FK→territories | YES |  |  |
| `route_code` | TEXT |  | NO |  |  |
| `route_name` | TEXT |  | NO |  |  |
| `route_type` | TEXT |  | NO |  |  |
| `visit_days` | ARRAY |  | YES |  |  |
| `visit_frequency` | TEXT |  | YES |  |  |
| `assigned_to_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `vehicle_required` | BOOLEAN |  | YES | false |  |
| `total_distance_km` | NUMERIC(10,2) |  | YES |  |  |
| `average_time_hours` | NUMERIC(5,2) |  | YES |  |  |
| `customer_count` | INTEGER(32) |  | YES | 0 |  |
| `customer_sequence` | JSONB |  | YES | '[]'::jsonb |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### parties.supplier_contacts

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `contact_id` | INTEGER(32) | PK | NO | nextval('parties.supplier_c... |  |
| `supplier_id` | INTEGER(32) | FK→suppliers | NO |  |  |
| `contact_name` | TEXT |  | NO |  |  |
| `designation` | TEXT |  | YES |  |  |
| `department` | TEXT |  | YES |  |  |
| `mobile_number` | TEXT |  | YES |  |  |
| `phone_number` | TEXT |  | YES |  |  |
| `email` | TEXT |  | YES |  |  |
| `is_primary_contact` | BOOLEAN |  | YES | false |  |
| `contact_for` | ARRAY |  | YES |  |  |
| `can_negotiate_prices` | BOOLEAN |  | YES | false |  |
| `can_approve_returns` | BOOLEAN |  | YES | false |  |
| `max_discount_authority` | NUMERIC(5,2) |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### parties.suppliers

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `supplier_id` | INTEGER(32) | PK | NO | nextval('parties.suppliers_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `supplier_code` | TEXT |  | NO |  |  |
| `supplier_name` | TEXT |  | NO |  |  |
| `supplier_type` | TEXT |  | NO |  |  |
| `primary_phone` | TEXT |  | NO |  |  |
| `primary_email` | TEXT |  | YES |  |  |
| `secondary_phone` | TEXT |  | YES |  |  |
| `contact_person_name` | TEXT |  | YES |  |  |
| `contact_person_phone` | TEXT |  | YES |  |  |
| `gst_number` | TEXT |  | YES |  |  |
| `pan_number` | TEXT |  | YES |  |  |
| `drug_license_number` | TEXT |  | YES |  |  |
| `drug_license_validity` | DATE |  | YES |  |  |
| `establishment_year` | INTEGER(32) |  | YES |  |  |
| `payment_days` | INTEGER(32) |  | YES | 30 |  |
| `preferred_payment_mode` | TEXT |  | YES | 'bank_transfer'::text |  |
| `early_payment_discount` | NUMERIC(5,2) |  | YES | 0 |  |
| `late_payment_penalty` | NUMERIC(5,2) |  | YES | 0 |  |
| `supplier_category` | TEXT |  | YES |  |  |
| `supplier_grade` | TEXT |  | YES |  |  |
| `product_categories` | ARRAY |  | YES |  |  |
| `brand_authorizations` | ARRAY |  | YES |  |  |
| `compliance_rating` | TEXT |  | YES | 'good'::text |  |
| `quality_rating` | NUMERIC(3,2) |  | YES |  |  |
| `delivery_rating` | NUMERIC(3,2) |  | YES |  |  |
| `vendor_documents` | JSONB |  | YES | '[]'::jsonb |  |
| `bank_name` | TEXT |  | YES |  |  |
| `account_number` | TEXT |  | YES |  |  |
| `ifsc_code` | TEXT |  | YES |  |  |
| `account_type` | TEXT |  | YES | 'current'::text |  |
| `account_holder_name` | TEXT |  | YES |  |  |
| `credit_limit_given` | NUMERIC(15,2) |  | YES |  |  |
| `current_outstanding` | NUMERIC(15,2) |  | YES | 0 |  |
| `first_purchase_date` | DATE |  | YES |  |  |
| `last_purchase_date` | DATE |  | YES |  |  |
| `total_purchase_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_purchases` | INTEGER(32) |  | YES | 0 |  |
| `average_order_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `return_rate_percentage` | NUMERIC(5,2) |  | YES | 0 |  |
| `quality_issue_count` | INTEGER(32) |  | YES | 0 |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `is_approved` | BOOLEAN |  | YES | false |  |
| `approved_date` | DATE |  | YES |  |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `blacklisted` | BOOLEAN |  | YES | false |  |
| `blacklist_reason` | TEXT |  | YES |  |  |
| `blacklist_date` | DATE |  | YES |  |  |
| `internal_notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `website` | TEXT |  | YES |  | Supplier website URL for reference and communication |

### parties.territories

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `territory_id` | INTEGER(32) | PK | NO | nextval('parties.territorie... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `territory_code` | TEXT |  | NO |  |  |
| `territory_name` | TEXT |  | NO |  |  |
| `territory_type` | TEXT |  | NO |  |  |
| `parent_territory_id` | INTEGER(32) | FK→territories | YES |  |  |
| `territory_path` | TEXT |  | YES |  |  |
| `geographic_data` | JSONB |  | YES | '{}'::jsonb |  |
| `territory_manager_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `sales_team_ids` | ARRAY |  | YES |  |  |
| `monthly_target` | NUMERIC(15,2) |  | YES |  |  |
| `quarterly_target` | NUMERIC(15,2) |  | YES |  |  |
| `annual_target` | NUMERIC(15,2) |  | YES |  |  |
| `current_month_achievement` | NUMERIC(15,2) |  | YES | 0 |  |
| `current_quarter_achievement` | NUMERIC(15,2) |  | YES | 0 |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

## inventory

**Tables:** `batches`, `competitor_pricing`, `inventory_movements`, `location_wise_stock`, `movement_summary`, `price_alerts`, `price_change_log`, `price_history`, `product_categories`, `product_types`, `products`, `reorder_suggestions`, `stock_reservations`, `stock_transfer_items`, `stock_transfers`, `storage_locations`, `units_of_measure`

### inventory.batches

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `batch_id` | INTEGER(32) | PK | NO | nextval('inventory.batches_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `batch_number` | TEXT |  | NO |  |  |
| `alternate_batch_number` | TEXT |  | YES |  |  |
| `manufacturing_date` | DATE |  | YES |  |  |
| `expiry_date` | DATE |  | NO |  |  |
| `retesting_date` | DATE |  | YES |  |  |
| `initial_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `quantity_available` | NUMERIC(15,3) |  | NO | 0 |  |
| `quantity_reserved` | NUMERIC(15,3) |  | YES | 0 | Quantity reserved for specific purposes |
| `quantity_quarantine` | NUMERIC(15,3) |  | YES | 0 |  |
| `location_count` | INTEGER(32) |  | YES | 0 |  |
| `primary_location_id` | INTEGER(32) |  | YES |  |  |
| `cost_per_unit` | NUMERIC(15,4) |  | YES |  | Purchase cost per base unit (only pricing source) |
| `mrp_per_unit` | NUMERIC(15,2) |  | NO |  | MRP per base unit (only MRP source) |
| `sale_price_per_unit` | NUMERIC(15,2) |  | YES |  | Selling price per base unit (only selling price source) |
| `qc_status` | TEXT |  | YES | 'pending'::text |  |
| `qc_date` | DATE |  | YES |  |  |
| `qc_certificate_number` | TEXT |  | YES |  |  |
| `qc_performed_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `source_type` | TEXT |  | NO |  |  |
| `source_reference_id` | INTEGER(32) |  | YES |  |  |
| `supplier_id` | INTEGER(32) | FK→suppliers | YES |  |  |
| `weighted_average_cost` | NUMERIC(15,4) |  | YES |  |  |
| `last_cost_update` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `cost_calculation_method` | TEXT |  | YES | 'weighted_average'::text |  |
| `batch_status` | TEXT |  | YES | 'active'::text |  |
| `expiry_status` | TEXT |  | YES |  |  |
| `recall_status` | TEXT |  | YES |  |  |
| `recall_date` | DATE |  | YES |  |  |
| `recall_reason` | TEXT |  | YES |  |  |
| `serial_numbers` | ARRAY |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `last_movement_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `pack_size` | INTEGER(32) |  | NO | 1 | Physical pack size (e.g., 10, 100, 500) |
| `pack_type` | TEXT |  | NO | 'unit'::text | Pack type (strip, box, bottle, vial, tube, sachet) |
| `pack_uom` | TEXT |  | NO | 'UNIT'::text | Pack unit of measure (STR, BOX, BTL, VL, TB, SAC) |
| `base_uom` | TEXT |  | NO | 'UNIT'::text | Base unit of measure (TAB, ML, GM, UNIT) |
| `units_per_pack` | INTEGER(32) |  | NO | 1 | Number of units (tablets/capsules/ml) per package |
| `packages_per_box` | INTEGER(32) |  | YES |  | Number of packages (strips/bottles/vials/boxes) per box |
| `tablets_per_strip` | INTEGER(32) |  | YES |  | DEPRECATED: Use units_per_pack instead. Kept for backward compatibility |
| `storage_condition` | TEXT |  | YES | 'room_temp'::text | Storage requirement (room_temp, cold_storage, freezer) |
| `storage_location` | TEXT |  | YES |  |  |
| `quality_status` | TEXT |  | YES | 'approved'::text | Quality control status (approved, quarantine, rejected) |
| `quality_notes` | TEXT |  | YES |  |  |
| `quantity_allocated` | NUMERIC(15,3) |  | YES | 0 | Quantity allocated to pending orders |
| `category_name` | TEXT |  | YES |  | Actual form of this batch (Tablet, Capsule, Syrup, etc.) |
| `category_id` | INTEGER(32) | FK→product_categories | YES |  | Category reference for reporting consistency |
| `product_type` | TEXT |  | YES | 'standard'::text | Product type classification (standard, kit, service, digital) |
| `quantity_returned` | NUMERIC(18,3) |  | YES | 0 |  |

### inventory.competitor_pricing

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `competitor_price_id` | INTEGER(32) | PK | NO | nextval('inventory.competit... |  |
| `org_id` | INTEGER(32) |  | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | YES |  |  |
| `competitor_name` | TEXT |  | NO |  |  |
| `competitor_price` | NUMERIC(12,2) |  | NO |  |  |
| `competitor_mrp` | NUMERIC(12,2) |  | YES |  |  |
| `data_source` | TEXT |  | YES |  |  |
| `price_comparison` | JSONB |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `last_updated` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### inventory.inventory_movements

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `movement_id` | INTEGER(32) | PK | NO | nextval('inventory.inventor... |  |
| `org_id` | UUID |  | NO |  |  |
| `movement_type` | TEXT |  | NO |  |  |
| `movement_date` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `movement_direction` | TEXT |  | NO |  |  |
| `product_id` | INTEGER(32) |  | NO |  |  |
| `batch_id` | INTEGER(32) |  | YES |  |  |
| `quantity` | NUMERIC(15,3) |  | NO |  |  |
| `pack_type` | TEXT |  | YES |  |  |
| `base_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `location_id` | INTEGER(32) |  | NO | 1 |  |
| `from_location_id` | INTEGER(32) |  | YES |  |  |
| `to_location_id` | INTEGER(32) |  | YES |  |  |
| `unit_cost` | NUMERIC(15,4) |  | YES |  |  |
| `total_cost` | NUMERIC(15,2) |  | YES |  |  |
| `reference_type` | TEXT |  | YES |  |  |
| `reference_id` | INTEGER(32) |  | YES |  |  |
| `reference_number` | TEXT |  | YES |  |  |
| `transfer_type` | TEXT |  | YES |  |  |
| `transfer_pair_id` | INTEGER(32) |  | YES |  |  |
| `reason` | TEXT |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `pack_display_data` | JSONB |  | YES |  |  |
| `cost_details` | JSONB |  | YES |  |  |
| `created_by` | INTEGER(32) |  | NO |  |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `approved_by` | INTEGER(32) |  | YES |  |  |
| `approved_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES |  |  |

### inventory.location_wise_stock

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `stock_id` | INTEGER(32) | PK | NO | nextval('inventory.location... |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `batch_id` | INTEGER(32) | FK→batches | NO |  |  |
| `location_id` | INTEGER(32) | FK→storage_locations | NO |  |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `quantity_available` | NUMERIC(15,3) |  | NO | 0 |  |
| `quantity_reserved` | NUMERIC(15,3) |  | YES | 0 |  |
| `quantity_quarantine` | NUMERIC(15,3) |  | YES | 0 |  |
| `stock_in_date` | DATE |  | NO | CURRENT_DATE |  |
| `unit_cost` | NUMERIC(15,4) |  | YES |  |  |
| `bin_number` | TEXT |  | YES |  |  |
| `pallet_number` | TEXT |  | YES |  |  |
| `stock_status` | TEXT |  | YES | 'available'::text |  |
| `last_movement_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `last_counted_date` | DATE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `last_updated` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### inventory.movement_summary

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `movement_type` | TEXT |  | YES |  |  |
| `product_id` | INTEGER(32) |  | YES |  |  |
| `quantity` | NUMERIC(15,3) |  | YES |  |  |
| `movement_date` | DATE |  | YES |  |  |
| `document_number` | TEXT |  | YES |  |  |
| `party_name` | TEXT |  | YES |  |  |
| `org_id` | UUID |  | YES |  |  |

### inventory.price_alerts

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `alert_id` | INTEGER(32) | PK | NO | nextval('inventory.price_al... |  |
| `org_id` | INTEGER(32) |  | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | YES |  |  |
| `batch_id` | INTEGER(32) | FK→batches | YES |  |  |
| `alert_type` | TEXT |  | NO |  |  |
| `alert_severity` | TEXT |  | YES |  |  |
| `current_price` | NUMERIC(12,2) |  | YES |  |  |
| `average_price` | NUMERIC(12,2) |  | YES |  |  |
| `competitor_price` | NUMERIC(12,2) |  | YES |  |  |
| `price_change_percent` | NUMERIC(5,2) |  | YES |  |  |
| `margin_impact_percent` | NUMERIC(5,2) |  | YES |  |  |
| `price_volatility` | NUMERIC(12,2) |  | YES |  |  |
| `price_difference_percent` | NUMERIC(5,2) |  | YES |  |  |
| `alert_message` | TEXT |  | NO |  |  |
| `price_data` | JSONB |  | YES |  |  |
| `price_variance_data` | JSONB |  | YES |  |  |
| `competitor_data` | JSONB |  | YES |  |  |
| `acknowledged` | BOOLEAN |  | YES | false |  |
| `acknowledged_by` | INTEGER(32) |  | YES |  |  |
| `acknowledged_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES |  |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### inventory.price_change_log

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `log_id` | INTEGER(32) | PK | NO | nextval('inventory.price_ch... |  |
| `org_id` | INTEGER(32) |  | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | YES |  |  |
| `batch_id` | INTEGER(32) | FK→batches | YES |  |  |
| `change_type` | TEXT |  | NO |  |  |
| `old_value` | NUMERIC(12,2) |  | YES |  |  |
| `new_value` | NUMERIC(12,2) |  | YES |  |  |
| `change_reason` | TEXT |  | YES |  |  |
| `changed_by` | INTEGER(32) |  | YES |  |  |
| `requires_approval` | BOOLEAN |  | YES | false |  |
| `approved_by` | INTEGER(32) |  | YES |  |  |
| `approved_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES |  |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### inventory.price_history

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `history_id` | INTEGER(32) | PK | NO | nextval('inventory.price_hi... |  |
| `org_id` | INTEGER(32) |  | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | YES |  |  |
| `batch_id` | INTEGER(32) | FK→batches | YES |  |  |
| `price_type` | TEXT |  | NO |  |  |
| `old_price` | NUMERIC(12,2) |  | YES |  |  |
| `new_price` | NUMERIC(12,2) |  | YES |  |  |
| `change_percent` | NUMERIC(5,2) |  | YES |  |  |
| `change_reason` | TEXT |  | YES |  |  |
| `changed_by` | INTEGER(32) |  | YES |  |  |
| `changed_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `source_reference` | TEXT |  | YES |  |  |

### inventory.product_categories

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `category_id` | INTEGER(32) | PK | NO | nextval('inventory.product_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `parent_category_id` | INTEGER(32) | FK→product_categories | YES |  |  |
| `category_code` | TEXT |  | NO |  |  |
| `category_name` | TEXT |  | NO |  |  |
| `category_level` | INTEGER(32) |  | NO | 1 |  |
| `category_path` | TEXT |  | YES |  |  |
| `category_type` | TEXT |  | YES | 'standard'::text |  |
| `requires_prescription` | BOOLEAN |  | YES | false |  |
| `requires_license` | BOOLEAN |  | YES | false |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `icon_name` | TEXT |  | YES |  |  |
| `color_code` | TEXT |  | YES |  |  |
| `default_hsn_code` | TEXT |  | YES |  |  |
| `default_gst_rate` | NUMERIC(5,2) |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### inventory.product_types

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `type_id` | INTEGER(32) | PK | NO | nextval('inventory.product_... |  |
| `type_code` | TEXT |  | NO |  |  |
| `type_name` | TEXT |  | NO |  |  |
| `default_base_uom` | TEXT |  | NO |  |  |
| `is_liquid` | BOOLEAN |  | YES | false |  |
| `is_injectable` | BOOLEAN |  | YES | false |  |
| `requires_cold_storage` | BOOLEAN |  | YES | false |  |
| `is_active` | BOOLEAN |  | YES | true |  |

### inventory.products

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `product_id` | INTEGER(32) | PK | NO | nextval('inventory.products... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `product_code` | TEXT |  | NO |  |  |
| `product_name` | TEXT |  | NO |  |  |
| `generic_name` | TEXT |  | YES |  |  |
| `brand` | TEXT |  | YES |  |  |
| `manufacturer` | TEXT |  | YES |  |  |
| `category_id` | INTEGER(32) | FK→product_categories | YES |  | Default category for this product (master data) |
| `product_type` | TEXT |  | NO | 'standard'::text | Business classification: standard, kit, service, digital |
| `product_class` | TEXT |  | YES | 'medicine'::text | Industry classification: medicine, surgical, cosmetic, ayurvedic |
| `composition` | JSONB |  | YES |  |  |
| `strength` | TEXT |  | YES |  |  |
| `hsn_code` | TEXT |  | YES |  |  |
| `drug_schedule` | TEXT |  | YES |  |  |
| `requires_prescription` | BOOLEAN |  | YES | false |  |
| `is_narcotic` | BOOLEAN |  | YES | false |  |
| `is_controlled_substance` | BOOLEAN |  | YES | false |  |
| `barcode` | TEXT |  | YES |  |  |
| `manufacturer_code` | TEXT |  | YES |  |  |
| `gst_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `cess_percentage` | NUMERIC(5,2) |  | YES | 0 |  |
| `maintain_batch` | BOOLEAN |  | YES | true |  |
| `maintain_expiry` | BOOLEAN |  | YES | true |  |
| `allow_negative_stock` | BOOLEAN |  | YES | false |  |
| `min_stock_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `reorder_level` | NUMERIC(15,3) |  | YES |  |  |
| `reorder_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `max_stock_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `critical_stock_level` | NUMERIC(15,3) |  | YES |  |  |
| `product_status` | TEXT |  | YES | 'active'::text |  |
| `launch_date` | DATE |  | YES |  |  |
| `discontinuation_date` | DATE |  | YES |  |  |
| `search_keywords` | ARRAY |  | YES |  |  |
| `tags` | ARRAY |  | YES |  |  |
| `product_images` | JSONB |  | YES | '[]'::jsonb |  |
| `documents` | JSONB |  | YES | '[]'::jsonb |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `is_saleable` | BOOLEAN |  | YES | true |  |
| `is_purchasable` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `type_id` | INTEGER(32) | FK→product_types | YES |  |  |
| `quantity_returned` | NUMERIC(18,3) |  | YES | 0 |  |

### inventory.reorder_suggestions

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `suggestion_id` | INTEGER(32) | PK | NO | nextval('inventory.reorder_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `current_stock` | NUMERIC(15,3) |  | NO |  |  |
| `reserved_stock` | NUMERIC(15,3) |  | YES | 0 |  |
| `available_stock` | NUMERIC(15,3) |  | YES |  |  |
| `reorder_level` | NUMERIC(15,3) |  | YES |  |  |
| `min_stock_level` | NUMERIC(15,3) |  | YES |  |  |
| `suggested_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `average_daily_consumption` | NUMERIC(15,3) |  | YES |  |  |
| `lead_time_days` | INTEGER(32) |  | YES |  |  |
| `safety_stock_days` | INTEGER(32) |  | YES |  |  |
| `preferred_supplier_id` | INTEGER(32) | FK→suppliers | YES |  |  |
| `last_purchase_price` | NUMERIC(15,2) |  | YES |  |  |
| `last_purchase_date` | DATE |  | YES |  |  |
| `urgency` | TEXT |  | NO |  |  |
| `suggested_order_date` | DATE |  | YES |  |  |
| `suggestion_status` | TEXT |  | YES | 'pending'::text |  |
| `action_taken` | TEXT |  | YES |  |  |
| `action_taken_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `action_taken_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### inventory.stock_reservations

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `reservation_id` | INTEGER(32) | PK | NO | nextval('inventory.stock_re... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `batch_id` | INTEGER(32) | FK→batches | YES |  |  |
| `location_id` | INTEGER(32) | FK→storage_locations | NO |  |  |
| `reserved_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `fulfilled_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `reference_type` | TEXT |  | NO |  |  |
| `reference_id` | INTEGER(32) |  | NO |  |  |
| `reservation_date` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `expires_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `priority` | INTEGER(32) |  | YES | 5 |  |
| `reservation_status` | TEXT |  | YES | 'active'::text |  |
| `reserved_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### inventory.stock_transfer_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `transfer_item_id` | INTEGER(32) | PK | NO | nextval('inventory.stock_tr... |  |
| `transfer_id` | INTEGER(32) | FK→stock_transfers | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `batch_id` | INTEGER(32) | FK→batches | YES |  |  |
| `requested_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `approved_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `dispatched_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `received_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `pack_type` | TEXT |  | NO |  |  |
| `pack_size` | INTEGER(32) |  | YES |  |  |
| `shortage_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `damage_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `discrepancy_reason` | TEXT |  | YES |  |  |
| `item_status` | TEXT |  | YES | 'pending'::text |  |
| `dispatch_notes` | TEXT |  | YES |  |  |
| `receipt_notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### inventory.stock_transfers

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `transfer_id` | INTEGER(32) | PK | NO | nextval('inventory.stock_tr... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `transfer_number` | TEXT |  | NO |  |  |
| `transfer_date` | DATE |  | NO |  |  |
| `transfer_type` | TEXT |  | NO |  |  |
| `from_branch_id` | INTEGER(32) | FK→org_branches | YES |  |  |
| `to_branch_id` | INTEGER(32) | FK→org_branches | YES |  |  |
| `from_location_id` | INTEGER(32) | FK→storage_locations | NO |  |  |
| `to_location_id` | INTEGER(32) | FK→storage_locations | NO |  |  |
| `transfer_reason` | TEXT |  | NO |  |  |
| `priority` | TEXT |  | YES | 'normal'::text |  |
| `expected_dispatch_date` | DATE |  | YES |  |  |
| `expected_delivery_date` | DATE |  | YES |  |  |
| `actual_dispatch_date` | DATE |  | YES |  |  |
| `actual_delivery_date` | DATE |  | YES |  |  |
| `transport_mode` | TEXT |  | YES |  |  |
| `transporter_name` | TEXT |  | YES |  |  |
| `vehicle_number` | TEXT |  | YES |  |  |
| `lr_number` | TEXT |  | YES |  |  |
| `lr_date` | DATE |  | YES |  |  |
| `transfer_status` | TEXT |  | YES | 'draft'::text |  |
| `requested_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `received_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `received_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `documents` | JSONB |  | YES | '[]'::jsonb |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### inventory.storage_locations

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `location_id` | INTEGER(32) | PK | NO | nextval('inventory.storage_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `parent_location_id` | INTEGER(32) | FK→storage_locations | YES |  |  |
| `location_code` | TEXT |  | NO |  |  |
| `location_name` | TEXT |  | NO |  |  |
| `location_type` | TEXT |  | NO |  |  |
| `location_path` | TEXT |  | YES |  |  |
| `storage_capacity` | JSONB |  | YES |  |  |
| `dimensions` | JSONB |  | YES |  |  |
| `temperature_controlled` | BOOLEAN |  | YES | false |  |
| `temperature_range` | JSONB |  | YES |  |  |
| `humidity_controlled` | BOOLEAN |  | YES | false |  |
| `humidity_range` | JSONB |  | YES |  |  |
| `restricted_access` | BOOLEAN |  | YES | false |  |
| `allowed_product_categories` | ARRAY |  | YES |  |  |
| `storage_class` | TEXT |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `is_full` | BOOLEAN |  | YES | false |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### inventory.units_of_measure

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `uom_id` | INTEGER(32) | PK | NO | nextval('inventory.units_of... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `uom_code` | TEXT |  | NO |  |  |
| `uom_name` | TEXT |  | NO |  |  |
| `uom_type` | TEXT |  | NO |  |  |
| `base_uom_code` | TEXT |  | YES |  |  |
| `conversion_factor` | NUMERIC(15,6) |  | YES | 1 |  |
| `symbol` | TEXT |  | YES |  |  |
| `decimal_places` | INTEGER(32) |  | YES | 0 |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

## sales

**Tables:** `credit_note_applications`, `credit_notes`, `customer_visits`, `debit_notes`, `delivery_challan_items`, `delivery_challans`, `delivery_tracking`, `eway_bills`, `invoice_items`, `invoice_return_status`, `invoices`, `loyalty_programs`, `loyalty_tiers`, `loyalty_transactions`, `order_items`, `orders`, `price_list_items`, `price_lists`, `promotional_schemes`, `proof_of_delivery`, `sales_return_items`, `sales_returns`, `sales_schemes`, `sales_targets`, `scheme_customers`, `scheme_products`, `scheme_usage`, `scheme_volume_slabs`, `v_invoice_calculation_debug`, `v_invoice_items_with_quantities`

### sales.credit_note_applications

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `application_id` | INTEGER(32) | PK | NO | nextval('sales.credit_note_... |  |
| `credit_note_id` | INTEGER(32) | FK→credit_notes | NO |  |  |
| `invoice_id` | INTEGER(32) | FK→invoices | NO |  |  |
| `applied_amount` | NUMERIC(15,2) |  | NO |  |  |
| `application_date` | DATE |  | NO | CURRENT_DATE |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.credit_notes

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `credit_note_id` | INTEGER(32) | PK | NO | nextval('sales.credit_notes... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `credit_note_number` | TEXT |  | NO |  |  |
| `credit_note_date` | DATE |  | NO | CURRENT_DATE |  |
| `customer_id` | INTEGER(32) | FK→customers | NO |  |  |
| `reference_type` | TEXT |  | YES |  |  |
| `reference_id` | INTEGER(32) |  | YES |  |  |
| `reference_number` | TEXT |  | YES |  |  |
| `credit_amount` | NUMERIC(15,2) |  | NO |  |  |
| `tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_amount` | NUMERIC(15,2) |  | NO |  |  |
| `reason_code` | TEXT |  | NO |  |  |
| `reason` | TEXT |  | NO |  |  |
| `notes` | TEXT |  | YES |  |  |
| `is_gst_applicable` | BOOLEAN |  | YES | true |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `status` | TEXT |  | YES | 'draft'::text |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `applied_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `remaining_amount` | NUMERIC(15,2) |  | YES |  | Auto-calculated: total_amount - applied_amount |
| `items_detail` | JSONB |  | YES |  |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.customer_visits

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `visit_id` | INTEGER(32) | PK | NO | nextval('sales.customer_vis... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `visit_date` | DATE |  | NO |  |  |
| `visit_time` | TIME WITHOUT TIME ZONE |  | YES |  |  |
| `customer_id` | INTEGER(32) | FK→customers | NO |  |  |
| `visited_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `route_id` | INTEGER(32) | FK→routes | YES |  |  |
| `visit_purpose` | TEXT |  | NO |  |  |
| `visit_outcome` | TEXT |  | YES |  |  |
| `order_id` | INTEGER(32) | FK→orders | YES |  |  |
| `collection_amount` | NUMERIC(15,2) |  | YES |  |  |
| `check_in_time` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `check_out_time` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `visit_location` | JSONB |  | YES |  |  |
| `visit_notes` | TEXT |  | YES |  |  |
| `follow_up_required` | BOOLEAN |  | YES | false |  |
| `follow_up_date` | DATE |  | YES |  |  |
| `follow_up_notes` | TEXT |  | YES |  |  |
| `visit_photos` | JSONB |  | YES | '[]'::jsonb |  |
| `visit_status` | TEXT |  | YES | 'completed'::text |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.debit_notes

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `debit_note_id` | INTEGER(32) | PK | NO | nextval('sales.debit_notes_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `debit_note_number` | TEXT |  | NO |  |  |
| `debit_note_date` | DATE |  | NO | CURRENT_DATE |  |
| `customer_id` | INTEGER(32) | FK→customers | NO |  |  |
| `reference_type` | TEXT |  | YES |  |  |
| `reference_id` | INTEGER(32) |  | YES |  |  |
| `reference_number` | TEXT |  | YES |  |  |
| `debit_amount` | NUMERIC(15,2) |  | NO |  |  |
| `tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_amount` | NUMERIC(15,2) |  | NO |  |  |
| `reason_code` | TEXT |  | NO |  |  |
| `reason` | TEXT |  | NO |  |  |
| `notes` | TEXT |  | YES |  |  |
| `is_gst_applicable` | BOOLEAN |  | YES | true |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `status` | TEXT |  | YES | 'draft'::text |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `paid_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `payment_status` | TEXT |  | YES |  | Auto-calculated based on paid_amount vs total_amount |
| `items_detail` | JSONB |  | YES |  |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.delivery_challan_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `challan_item_id` | INTEGER(32) | PK | NO | nextval('sales.delivery_cha... |  |
| `challan_id` | INTEGER(32) | FK→delivery_challans | NO |  |  |
| `order_item_id` | INTEGER(32) | FK→order_items | YES |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `batch_id` | INTEGER(32) |  | YES |  |  |
| `ordered_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `dispatched_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `delivered_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `returned_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `damaged_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `uom` | TEXT |  | NO |  |  |
| `pack_type` | TEXT |  | NO |  |  |
| `item_status` | TEXT |  | YES | 'dispatched'::text |  |
| `item_notes` | TEXT |  | YES |  |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `unit_price` | NUMERIC(15,2) |  | YES | 0 |  |

### sales.delivery_challans

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `challan_id` | INTEGER(32) | PK | NO | nextval('sales.delivery_cha... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `challan_number` | TEXT |  | NO |  |  |
| `challan_date` | DATE |  | NO | CURRENT_DATE |  |
| `challan_type` | TEXT |  | YES | 'delivery'::text |  |
| `order_id` | INTEGER(32) | FK→orders | YES |  | Optional link to order - challans can exist independently |
| `invoice_id` | INTEGER(32) | FK→invoices | YES |  |  |
| `customer_id` | INTEGER(32) | FK→customers | NO |  |  |
| `delivery_address_id` | INTEGER(32) | FK→addresses | YES |  |  |
| `dispatch_date` | DATE |  | YES |  |  |
| `dispatch_time` | TIME WITHOUT TIME ZONE |  | YES |  |  |
| `dispatch_address_id` | INTEGER(32) | FK→addresses | YES |  |  |
| `transport_mode` | TEXT |  | YES |  |  |
| `transporter_name` | TEXT |  | YES |  |  |
| `vehicle_number` | TEXT |  | YES |  |  |
| `lr_number` | TEXT |  | YES |  |  |
| `lr_date` | DATE |  | YES |  |  |
| `freight_charges` | NUMERIC(15,2) |  | YES |  | Freight/delivery charges |
| `eway_bill_required` | BOOLEAN |  | YES | false |  |
| `eway_bill_number` | TEXT |  | YES |  |  |
| `eway_bill_date` | DATE |  | YES |  |  |
| `eway_bill_validity_days` | INTEGER(32) |  | YES |  |  |
| `eway_bill_data` | JSONB |  | YES |  |  |
| `total_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `total_amount` | NUMERIC(15,2) |  | YES |  |  |
| `challan_status` | TEXT |  | YES | 'draft'::text |  |
| `delivery_status` | TEXT |  | YES | 'pending'::text |  |
| `delivered_date` | DATE |  | YES |  |  |
| `delivered_time` | TIME WITHOUT TIME ZONE |  | YES |  |  |
| `received_by` | TEXT |  | YES |  |  |
| `delivery_notes` | TEXT |  | YES |  |  |
| `pod_document` | TEXT |  | YES |  |  |
| `is_returnable` | BOOLEAN |  | YES | false |  |
| `return_by_date` | DATE |  | YES |  |  |
| `return_status` | TEXT |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `internal_notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `taxable_amount` | NUMERIC(15,2) |  | YES | 0 | Sum of item quantities × unit prices before tax |
| `gst_amount` | NUMERIC(15,2) |  | YES | 0 | Total GST/tax amount on the challan |

### sales.delivery_tracking

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `tracking_id` | INTEGER(32) | PK | NO | nextval('sales.delivery_tra... |  |
| `challan_id` | INTEGER(32) |  | NO |  |  |
| `status` | TEXT |  | NO |  |  |
| `location` | TEXT |  | YES |  |  |
| `timestamp` | TIMESTAMP WITH TIME ZONE |  | NO |  |  |
| `gps_latitude` | NUMERIC(10,7) |  | YES |  |  |
| `gps_longitude` | NUMERIC(10,7) |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `updated_by` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.eway_bills

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `eway_bill_id` | INTEGER(32) | PK | NO | nextval('sales.eway_bills_e... |  |
| `challan_id` | INTEGER(32) |  | YES |  |  |
| `eway_bill_number` | TEXT |  | NO |  |  |
| `supply_type` | TEXT |  | NO |  |  |
| `sub_type` | TEXT |  | NO |  |  |
| `document_type` | TEXT |  | NO |  |  |
| `document_number` | TEXT |  | NO |  |  |
| `document_date` | DATE |  | NO |  |  |
| `from_gstin` | TEXT |  | YES |  |  |
| `to_gstin` | TEXT |  | YES |  |  |
| `transport_mode` | TEXT |  | NO |  |  |
| `transport_distance` | INTEGER(32) |  | YES |  |  |
| `transporter_name` | TEXT |  | YES |  |  |
| `transporter_id` | TEXT |  | YES |  |  |
| `vehicle_number` | TEXT |  | YES |  |  |
| `valid_until` | TIMESTAMP WITH TIME ZONE |  | NO |  |  |
| `status` | TEXT |  | NO | 'active'::text |  |
| `generated_date` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.invoice_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `invoice_item_id` | INTEGER(32) | PK | NO | nextval('sales.invoice_item... |  |
| `invoice_id` | INTEGER(32) | FK→invoices | NO |  |  |
| `invoice_id` | INTEGER(32) | FK→invoices | NO |  |  |
| `order_item_id` | INTEGER(32) | FK→order_items | YES |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `product_name` | TEXT |  | NO |  |  |
| `product_description` | TEXT |  | YES |  |  |
| `hsn_code` | TEXT |  | YES |  |  |
| `batch_id` | INTEGER(32) |  | YES |  |  |
| `batch_number` | TEXT |  | YES |  |  |
| `manufacturing_date` | DATE |  | YES |  |  |
| `expiry_date` | DATE |  | YES |  |  |
| `quantity` | NUMERIC(15,3) |  | NO |  | Total items delivered (base + free). Used for inventory deduction and logistics. |
| `uom` | TEXT |  | NO |  |  |
| `pack_type` | TEXT |  | NO |  |  |
| `pack_size` | INTEGER(32) |  | YES |  |  |
| `base_quantity` | NUMERIC(15,3) |  | YES |  | Billable quantity (what customer pays for). Used for all revenue calculations. |
| `mrp` | NUMERIC(15,2) |  | YES |  |  |
| `unit_price` | NUMERIC(15,4) |  | NO |  |  |
| `discount_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `discount_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `taxable_amount` | NUMERIC(15,2) |  | YES |  |  |
| `igst_rate` | NUMERIC(5,2) |  | YES | 0 |  |
| `igst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_rate` | NUMERIC(5,2) |  | YES | 0 |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_rate` | NUMERIC(5,2) |  | YES | 0 |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_rate` | NUMERIC(5,2) |  | YES | 0 |  |
| `cess_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `line_total` | NUMERIC(15,2) |  | NO |  |  |
| `is_free_item` | BOOLEAN |  | YES | false |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `free_quantity` | NUMERIC(15,3) |  | YES | 0 | Promotional/free quantity given. Used for analytics and promotional tracking. |
| `item_id` | INTEGER(32) |  | NO | nextval('sales.invoice_item... |  |
| `quantity_returned` | NUMERIC(18,3) |  | YES | 0 |  |

### sales.invoice_return_status

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `invoice_id` | INTEGER(32) |  | YES |  |  |
| `invoice_number` | TEXT |  | YES |  |  |
| `invoice_amount` | NUMERIC(15,2) |  | YES |  |  |
| `return_count` | BIGINT(64) |  | YES |  |  |
| `total_returned_amount` | NUMERIC |  | YES |  |  |
| `return_status` | TEXT |  | YES |  |  |

### sales.invoices

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `invoice_id` | INTEGER(32) | PK | NO | nextval('sales.invoices_inv... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `invoice_number` | TEXT |  | NO |  |  |
| `invoice_date` | DATE |  | NO | CURRENT_DATE |  |
| `invoice_type` | TEXT |  | YES | 'tax_invoice'::text |  |
| `order_id` | INTEGER(32) | FK→orders | YES |  |  |
| `challan_ids` | ARRAY |  | YES |  |  |
| `customer_id` | INTEGER(32) | FK→customers | NO |  |  |
| `customer_name` | TEXT |  | NO |  |  |
| `billing_address_id` | INTEGER(32) | FK→addresses | YES |  |  |
| `shipping_address_id` | INTEGER(32) | FK→addresses | YES |  |  |
| `place_of_supply` | TEXT |  | YES |  |  |
| `reverse_charge` | BOOLEAN |  | YES | false |  |
| `subtotal_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `discount_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `scheme_discount` | NUMERIC(15,2) |  | YES | 0 |  |
| `taxable_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `freight_charges` | NUMERIC(15,2) |  | YES | 0 |  |
| `insurance_charges` | NUMERIC(15,2) |  | YES | 0 |  |
| `other_charges` | NUMERIC(15,2) |  | YES | 0 |  |
| `round_off_amount` | NUMERIC(5,2) |  | YES | 0 |  |
| `final_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `amount_in_words` | TEXT |  | YES |  |  |
| `payment_terms` | TEXT |  | YES |  |  |
| `due_date` | DATE |  | YES |  |  |
| `payment_status` | TEXT |  | YES | 'pending'::text |  |
| `paid_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `einvoice_required` | BOOLEAN |  | YES | false |  |
| `irn` | TEXT |  | YES |  |  |
| `irn_generated_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `qr_code` | TEXT |  | YES |  |  |
| `ack_number` | TEXT |  | YES |  |  |
| `ack_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `invoice_status` | TEXT |  | YES | 'draft'::text |  |
| `cancellation_reason` | TEXT |  | YES |  |  |
| `cancelled_date` | DATE |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `internal_notes` | TEXT |  | YES |  |  |
| `terms_and_conditions` | TEXT |  | YES |  |  |
| `bank_account_id` | INTEGER(32) | FK→org_bank_accounts | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `posted_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `posted_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `items_count` | INTEGER(32) |  | YES | 0 |  |
| `total_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `loyalty_points_used` | INTEGER(32) |  | YES |  |  |
| `loyalty_discount` | NUMERIC(15,2) |  | YES |  |  |
| `credit_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `allocated_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `unallocated_amount` | NUMERIC(15,2) |  | YES |  |  |

### sales.loyalty_programs

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `program_id` | INTEGER(32) | PK | NO | nextval('sales.loyalty_prog... |  |
| `org_id` | UUID |  | NO |  |  |
| `program_name` | TEXT |  | NO |  |  |
| `description` | TEXT |  | YES |  |  |
| `points_per_rupee` | NUMERIC(5,2) |  | YES | 1.0 |  |
| `redemption_ratio` | NUMERIC(5,2) |  | YES | 0.25 |  |
| `min_purchase_amount` | NUMERIC(15,2) |  | YES |  |  |
| `min_redemption_points` | INTEGER(32) |  | YES | 100 |  |
| `max_redemption_percentage` | NUMERIC(5,2) |  | YES | 50 |  |
| `points_validity_days` | INTEGER(32) |  | YES |  |  |
| `tier_based` | BOOLEAN |  | YES | false |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.loyalty_tiers

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `tier_id` | INTEGER(32) | PK | NO | nextval('sales.loyalty_tier... |  |
| `program_id` | INTEGER(32) | FK→loyalty_programs | YES |  |  |
| `tier_name` | TEXT |  | NO |  |  |
| `min_points_required` | INTEGER(32) |  | NO |  |  |
| `points_multiplier` | NUMERIC(5,2) |  | YES | 1.0 |  |
| `additional_benefits` | TEXT |  | YES |  |  |

### sales.loyalty_transactions

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `transaction_id` | INTEGER(32) | PK | NO | nextval('sales.loyalty_tran... |  |
| `program_id` | INTEGER(32) | FK→loyalty_programs | YES |  |  |
| `customer_id` | INTEGER(32) | FK→customers | YES |  |  |
| `transaction_type` | TEXT |  | NO |  |  |
| `points` | INTEGER(32) |  | NO |  |  |
| `reference_type` | TEXT |  | YES |  |  |
| `reference_id` | INTEGER(32) |  | YES |  |  |
| `remarks` | TEXT |  | YES |  |  |
| `expiry_date` | DATE |  | YES |  |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.order_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `order_item_id` | INTEGER(32) | PK | NO | nextval('sales.order_items_... |  |
| `order_id` | INTEGER(32) | FK→orders | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `product_name` | TEXT |  | YES |  |  |
| `hsn_code` | TEXT |  | YES |  |  |
| `quantity` | NUMERIC(15,3) |  | NO |  |  |
| `uom` | TEXT |  | YES |  |  |
| `pack_type` | TEXT |  | YES |  |  |
| `pack_size` | INTEGER(32) |  | YES |  |  |
| `base_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `unit_price` | NUMERIC(15,4) |  | NO |  |  |
| `mrp` | NUMERIC(15,2) |  | YES |  |  |
| `discount_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `discount_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `scheme_discount_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `scheme_discount_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `free_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `scheme_code` | TEXT |  | YES |  |  |
| `taxable_amount` | NUMERIC(15,2) |  | YES |  |  |
| `tax_percent` | NUMERIC(5,2) |  | YES |  |  |
| `tax_amount` | NUMERIC(15,2) |  | YES |  |  |
| `igst_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `cgst_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `sgst_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `cess_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `line_total` | NUMERIC(15,2) |  | NO |  |  |
| `batch_id` | INTEGER(32) |  | YES |  |  |
| `batch_number` | TEXT |  | YES |  |  |
| `batch_expiry` | DATE |  | YES |  |  |
| `ordered_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `delivered_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `pending_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `cancelled_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `item_status` | TEXT |  | YES | 'pending'::text |  |
| `item_notes` | TEXT |  | YES |  |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `cgst_rate` | NUMERIC(5,2) |  | YES |  |  |
| `sgst_rate` | NUMERIC(5,2) |  | YES |  |  |
| `igst_rate` | NUMERIC(5,2) |  | YES |  |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES |  |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES |  |  |
| `igst_amount` | NUMERIC(15,2) |  | YES |  |  |
| `cess_rate` | NUMERIC(5,2) |  | YES |  |  |
| `cess_amount` | NUMERIC(15,2) |  | YES |  |  |
| `delivery_status` | TEXT |  | YES | 'pending'::text |  |
| `notes` | TEXT |  | YES |  |  |
| `product_code` | TEXT |  | YES |  |  |

### sales.orders

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `order_id` | INTEGER(32) | PK | NO | nextval('sales.orders_order... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `order_number` | TEXT |  | NO |  |  |
| `order_date` | DATE |  | NO | CURRENT_DATE |  |
| `order_type` | TEXT |  | NO | 'standard'::text |  |
| `customer_id` | INTEGER(32) | FK→customers | NO |  |  |
| `customer_po_number` | TEXT |  | YES |  |  |
| `customer_po_date` | DATE |  | YES |  |  |
| `delivery_date` | DATE |  | YES |  |  |
| `delivery_priority` | TEXT |  | YES | 'normal'::text |  |
| `delivery_address_id` | INTEGER(32) | FK→addresses | YES |  |  |
| `delivery_instructions` | TEXT |  | YES |  |  |
| `salesperson_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `territory_id` | INTEGER(32) | FK→territories | YES |  |  |
| `route_id` | INTEGER(32) | FK→routes | YES |  |  |
| `price_list_id` | INTEGER(32) |  | YES |  |  |
| `currency_code` | TEXT |  | YES | 'INR'::text |  |
| `subtotal_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `discount_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `scheme_discount` | NUMERIC(15,2) |  | YES | 0 |  |
| `taxable_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `round_off_amount` | NUMERIC(5,2) |  | YES | 0 |  |
| `final_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `order_status` | TEXT |  | YES | 'draft'::text |  |
| `approval_status` | TEXT |  | YES | 'pending'::text |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `payment_terms` | TEXT |  | YES |  |  |
| `payment_status` | TEXT |  | YES | 'pending'::text |  |
| `fulfillment_status` | TEXT |  | YES | 'pending'::text |  |
| `items_count` | INTEGER(32) |  | YES | 0 |  |
| `items_delivered` | INTEGER(32) |  | YES | 0 |  |
| `notes` | TEXT |  | YES |  |  |
| `internal_notes` | TEXT |  | YES |  |  |
| `tags` | ARRAY |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `updated_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `paid_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `confirmed_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `delivered_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `customer_name` | TEXT |  | YES |  |  |
| `customer_phone` | TEXT |  | YES |  |  |
| `balance_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `payment_mode` | TEXT |  | YES | 'credit'::text |  |
| `eway_bill_number` | TEXT |  | YES |  |  |
| `pod_recorded` | BOOLEAN |  | YES | false |  |
| `last_tracking_update` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `expected_delivery_date` | DATE |  | YES |  |  |
| `delivery_area` | TEXT |  | YES |  |  |

### sales.price_list_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `price_list_item_id` | INTEGER(32) | PK | NO | nextval('sales.price_list_i... |  |
| `price_list_id` | INTEGER(32) | FK→price_lists | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `base_unit_price` | NUMERIC(15,4) |  | YES |  |  |
| `pack_unit_price` | NUMERIC(15,4) |  | YES |  |  |
| `box_unit_price` | NUMERIC(15,4) |  | YES |  |  |
| `case_unit_price` | NUMERIC(15,4) |  | YES |  |  |
| `mrp` | NUMERIC(15,2) |  | YES |  |  |
| `ptr_margin_percent` | NUMERIC(5,2) |  | YES |  |  |
| `pts_margin_percent` | NUMERIC(5,2) |  | YES |  |  |
| `min_order_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `min_order_pack_type` | TEXT |  | YES |  |  |
| `max_discount_percent` | NUMERIC(5,2) |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.price_lists

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `price_list_id` | INTEGER(32) | PK | NO | nextval('sales.price_lists_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `price_list_name` | TEXT |  | NO |  |  |
| `price_list_type` | TEXT |  | NO |  |  |
| `currency_code` | TEXT |  | YES | 'INR'::text |  |
| `effective_from` | DATE |  | NO |  |  |
| `effective_until` | DATE |  | YES |  |  |
| `applicable_branches` | ARRAY |  | YES |  |  |
| `applicable_territories` | ARRAY |  | YES |  |  |
| `applicable_customer_groups` | ARRAY |  | YES |  |  |
| `parent_price_list_id` | INTEGER(32) | FK→price_lists | YES |  |  |
| `adjustment_type` | TEXT |  | YES |  |  |
| `adjustment_value` | NUMERIC(15,4) |  | YES |  |  |
| `requires_approval` | BOOLEAN |  | YES | false |  |
| `approval_status` | TEXT |  | YES | 'approved'::text |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_date` | DATE |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `is_default` | BOOLEAN |  | YES | false |  |
| `description` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### sales.promotional_schemes

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `scheme_id` | INTEGER(32) | PK | NO | nextval('sales.promotional_... |  |
| `org_id` | UUID |  | NO |  |  |
| `scheme_code` | TEXT |  | NO |  |  |
| `scheme_name` | TEXT |  | NO |  |  |
| `scheme_type` | TEXT |  | NO |  |  |
| `description` | TEXT |  | YES |  |  |
| `start_date` | DATE |  | NO |  |  |
| `end_date` | DATE |  | NO |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `discount_percentage` | NUMERIC(5,2) |  | YES |  |  |
| `discount_amount` | NUMERIC(15,2) |  | YES |  |  |
| `buy_quantity` | INTEGER(32) |  | YES |  |  |
| `get_quantity` | INTEGER(32) |  | YES |  |  |
| `min_bill_value` | NUMERIC(15,2) |  | YES |  |  |
| `max_discount_amount` | NUMERIC(15,2) |  | YES |  |  |
| `max_uses_per_customer` | INTEGER(32) |  | YES |  |  |
| `can_combine` | BOOLEAN |  | YES | false |  |
| `priority` | INTEGER(32) |  | YES | 1 |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.proof_of_delivery

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `pod_id` | INTEGER(32) | PK | NO | nextval('sales.proof_of_del... |  |
| `challan_id` | INTEGER(32) |  | NO |  |  |
| `customer_id` | INTEGER(32) | FK→customers | YES |  |  |
| `delivered_date` | DATE |  | NO |  |  |
| `delivered_time` | TIME WITHOUT TIME ZONE |  | YES |  |  |
| `received_by_name` | TEXT |  | NO |  |  |
| `received_by_designation` | TEXT |  | YES |  |  |
| `received_by_phone` | TEXT |  | YES |  |  |
| `delivery_location` | TEXT |  | YES |  |  |
| `delivery_notes` | TEXT |  | YES |  |  |
| `signature_image` | TEXT |  | YES |  |  |
| `delivery_photo` | TEXT |  | YES |  |  |
| `gps_latitude` | NUMERIC(10,7) |  | YES |  |  |
| `gps_longitude` | NUMERIC(10,7) |  | YES |  |  |
| `delivery_rating` | INTEGER(32) |  | YES |  |  |
| `created_date` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.sales_return_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `return_item_id` | INTEGER(32) | PK | NO | nextval('sales.sales_return... |  |
| `return_id` | INTEGER(32) | FK→sales_returns | NO |  |  |
| `invoice_item_id` | INTEGER(32) | FK→invoice_items | YES |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `batch_id` | INTEGER(32) | FK→batches | YES |  |  |
| `batch_number` | TEXT |  | YES |  |  |
| `return_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `uom` | TEXT |  | NO |  |  |
| `damaged_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `saleable_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `unit_price` | NUMERIC(15,4) |  | YES |  |  |
| `return_value` | NUMERIC(15,2) |  | YES |  |  |
| `tax_amount` | NUMERIC(15,2) |  | YES |  |  |
| `item_return_reason` | TEXT |  | YES |  |  |
| `disposition` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.sales_returns

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `return_id` | INTEGER(32) | PK | NO | nextval('sales.sales_return... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `return_number` | TEXT |  | NO |  |  |
| `return_date` | DATE |  | NO | CURRENT_DATE |  |
| `return_type` | TEXT |  | NO |  |  |
| `invoice_id` | INTEGER(32) | FK→invoices | YES |  |  |
| `challan_id` | INTEGER(32) | FK→delivery_challans | YES |  |  |
| `customer_id` | INTEGER(32) | FK→customers | NO |  |  |
| `return_reason` | TEXT |  | NO |  |  |
| `return_category` | TEXT |  | YES |  |  |
| `approval_required` | BOOLEAN |  | YES | true |  |
| `approval_status` | TEXT |  | YES | 'pending'::text |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `return_amount` | NUMERIC(15,2) |  | YES |  |  |
| `tax_amount` | NUMERIC(15,2) |  | YES |  |  |
| `total_amount` | NUMERIC(15,2) |  | YES |  |  |
| `credit_note_number` | TEXT |  | YES |  |  |
| `credit_note_date` | DATE |  | YES |  |  |
| `credit_note_status` | TEXT |  | YES | 'pending'::text |  |
| `igst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `adjustment_type` | TEXT |  | YES |  |  |
| `adjusted_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `pending_amount` | NUMERIC(15,2) |  | YES |  |  |
| `goods_received_date` | DATE |  | YES |  |  |
| `goods_received_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `quality_check_status` | TEXT |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `internal_notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### sales.sales_schemes

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `scheme_id` | INTEGER(32) | PK | NO | nextval('sales.sales_scheme... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `scheme_code` | TEXT |  | NO |  |  |
| `scheme_name` | TEXT |  | NO |  |  |
| `scheme_type` | TEXT |  | NO |  |  |
| `start_date` | DATE |  | NO |  |  |
| `end_date` | DATE |  | NO |  |  |
| `applicable_branches` | ARRAY |  | YES |  |  |
| `applicable_territories` | ARRAY |  | YES |  |  |
| `applicable_customers` | ARRAY |  | YES |  |  |
| `applicable_customer_types` | ARRAY |  | YES |  |  |
| `scheme_rules` | JSONB |  | NO |  |  |
| `applicable_products` | ARRAY |  | YES |  |  |
| `applicable_categories` | ARRAY |  | YES |  |  |
| `scheme_budget` | NUMERIC(15,2) |  | YES |  |  |
| `utilized_budget` | NUMERIC(15,2) |  | YES | 0 |  |
| `max_benefit_per_order` | NUMERIC(15,2) |  | YES |  |  |
| `approval_status` | TEXT |  | YES | 'draft'::text |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_date` | DATE |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `can_combine` | BOOLEAN |  | YES | false |  |
| `total_orders` | INTEGER(32) |  | YES | 0 |  |
| `total_discount_given` | NUMERIC(15,2) |  | YES | 0 |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### sales.sales_targets

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `target_id` | INTEGER(32) | PK | NO | nextval('sales.sales_target... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `target_year` | INTEGER(32) |  | NO |  |  |
| `target_month` | INTEGER(32) |  | YES |  |  |
| `target_quarter` | INTEGER(32) |  | YES |  |  |
| `period_type` | TEXT |  | NO |  |  |
| `target_type` | TEXT |  | NO |  |  |
| `target_entity_id` | INTEGER(32) |  | NO |  |  |
| `revenue_target` | NUMERIC(15,2) |  | YES |  |  |
| `quantity_target` | NUMERIC(15,3) |  | YES |  |  |
| `new_customer_target` | INTEGER(32) |  | YES |  |  |
| `visit_target` | INTEGER(32) |  | YES |  |  |
| `revenue_achieved` | NUMERIC(15,2) |  | YES | 0 |  |
| `quantity_achieved` | NUMERIC(15,3) |  | YES | 0 |  |
| `new_customers_achieved` | INTEGER(32) |  | YES | 0 |  |
| `visits_achieved` | INTEGER(32) |  | YES | 0 |  |
| `revenue_achievement_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `overall_achievement_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `incentive_percentage` | NUMERIC(5,2) |  | YES |  |  |
| `calculated_incentive` | NUMERIC(15,2) |  | YES |  |  |
| `status` | TEXT |  | YES | 'active'::text |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### sales.scheme_customers

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `scheme_id` | INTEGER(32) | PK | NO |  |  |
| `customer_id` | INTEGER(32) | PK | NO |  |  |

### sales.scheme_products

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `scheme_id` | INTEGER(32) | PK | NO |  |  |
| `product_id` | INTEGER(32) | PK | NO |  |  |

### sales.scheme_usage

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `usage_id` | INTEGER(32) | PK | NO | nextval('sales.scheme_usage... |  |
| `scheme_id` | INTEGER(32) | FK→promotional_schemes | YES |  |  |
| `invoice_id` | INTEGER(32) | FK→invoices | YES |  |  |
| `customer_id` | INTEGER(32) | FK→customers | YES |  |  |
| `usage_date` | DATE |  | NO |  |  |
| `discount_given` | NUMERIC(15,2) |  | YES |  |  |
| `free_items_data` | JSONB |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### sales.scheme_volume_slabs

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `slab_id` | INTEGER(32) | PK | NO | nextval('sales.scheme_volum... |  |
| `scheme_id` | INTEGER(32) | FK→promotional_schemes | YES |  |  |
| `min_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `max_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `discount_percentage` | NUMERIC(5,2) |  | YES |  |  |
| `discount_amount` | NUMERIC(15,2) |  | YES |  |  |

### sales.v_invoice_calculation_debug

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `invoice_id` | INTEGER(32) |  | YES |  |  |
| `invoice_item_id` | INTEGER(32) |  | YES |  |  |
| `product_id` | INTEGER(32) |  | YES |  |  |
| `product_name` | TEXT |  | YES |  |  |
| `total_qty` | NUMERIC(15,3) |  | YES |  |  |
| `billable_qty` | NUMERIC(15,3) |  | YES |  |  |
| `free_qty` | NUMERIC(15,3) |  | YES |  |  |
| `unit_price` | NUMERIC(15,4) |  | YES |  |  |
| `discount_percent` | NUMERIC(5,2) |  | YES |  |  |
| `discount_amount` | NUMERIC(15,2) |  | YES |  |  |
| `taxable_amount` | NUMERIC(15,2) |  | YES |  |  |
| `total_tax_amount` | NUMERIC(15,2) |  | YES |  |  |
| `line_total` | NUMERIC(15,2) |  | YES |  |  |
| `expected_subtotal` | NUMERIC |  | YES |  |  |
| `expected_discount` | NUMERIC |  | YES |  |  |
| `expected_taxable` | NUMERIC |  | YES |  |  |
| `validation_status` | TEXT |  | YES |  |  |
| `invoice_number` | TEXT |  | YES |  |  |
| `invoice_total` | NUMERIC(15,2) |  | YES |  |  |

### sales.v_invoice_items_with_quantities

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `invoice_item_id` | INTEGER(32) |  | YES |  |  |
| `invoice_id` | INTEGER(32) |  | YES |  |  |
| `order_item_id` | INTEGER(32) |  | YES |  |  |
| `product_id` | INTEGER(32) |  | YES |  |  |
| `product_name` | TEXT |  | YES |  |  |
| `product_description` | TEXT |  | YES |  |  |
| `hsn_code` | TEXT |  | YES |  |  |
| `batch_id` | INTEGER(32) |  | YES |  |  |
| `batch_number` | TEXT |  | YES |  |  |
| `manufacturing_date` | DATE |  | YES |  |  |
| `expiry_date` | DATE |  | YES |  |  |
| `quantity` | NUMERIC(15,3) |  | YES |  |  |
| `uom` | TEXT |  | YES |  |  |
| `pack_type` | TEXT |  | YES |  |  |
| `pack_size` | INTEGER(32) |  | YES |  |  |
| `base_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `mrp` | NUMERIC(15,2) |  | YES |  |  |
| `unit_price` | NUMERIC(15,4) |  | YES |  |  |
| `discount_percent` | NUMERIC(5,2) |  | YES |  |  |
| `discount_amount` | NUMERIC(15,2) |  | YES |  |  |
| `taxable_amount` | NUMERIC(15,2) |  | YES |  |  |
| `igst_rate` | NUMERIC(5,2) |  | YES |  |  |
| `igst_amount` | NUMERIC(15,2) |  | YES |  |  |
| `cgst_rate` | NUMERIC(5,2) |  | YES |  |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES |  |  |
| `sgst_rate` | NUMERIC(5,2) |  | YES |  |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES |  |  |
| `cess_rate` | NUMERIC(5,2) |  | YES |  |  |
| `cess_amount` | NUMERIC(15,2) |  | YES |  |  |
| `total_tax_amount` | NUMERIC(15,2) |  | YES |  |  |
| `line_total` | NUMERIC(15,2) |  | YES |  |  |
| `is_free_item` | BOOLEAN |  | YES |  |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `free_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `billable_amount` | NUMERIC |  | YES |  |  |
| `free_value` | NUMERIC |  | YES |  |  |
| `free_percentage` | NUMERIC |  | YES |  |  |

## procurement

**Tables:** `branch_budgets`, `goods_receipt_notes`, `grn_items`, `grn_return_status`, `purchase_order_items`, `purchase_orders`, `purchase_requisition_items`, `purchase_requisitions`, `purchase_return_items`, `purchase_returns`, `supplier_invoice_items`, `supplier_invoice_return_status`, `supplier_invoices`, `supplier_quotation_items`, `supplier_quotations`, `vendor_performance`

### procurement.branch_budgets

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `budget_id` | INTEGER(32) | PK | NO | nextval('procurement.branch... |  |
| `org_id` | INTEGER(32) |  | NO |  |  |
| `branch_id` | INTEGER(32) |  | NO |  |  |
| `budget_month` | INTEGER(32) |  | NO |  |  |
| `budget_year` | INTEGER(32) |  | NO |  |  |
| `budget_amount` | NUMERIC(15,2) |  | NO |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### procurement.goods_receipt_notes

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `grn_id` | INTEGER(32) | PK | NO | nextval('procurement.goods_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `grn_number` | TEXT |  | NO |  |  |
| `grn_date` | DATE |  | NO | CURRENT_DATE |  |
| `grn_type` | TEXT |  | YES | 'purchase'::text |  |
| `purchase_order_id` | INTEGER(32) | FK→purchase_orders | YES |  |  |
| `supplier_id` | INTEGER(32) | FK→suppliers | YES |  |  |
| `supplier_invoice_number` | TEXT |  | YES |  |  |
| `supplier_invoice_date` | DATE |  | YES |  |  |
| `supplier_challan_number` | TEXT |  | YES |  |  |
| `supplier_challan_date` | DATE |  | YES |  |  |
| `received_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `received_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `storage_location_id` | INTEGER(32) | FK→storage_locations | YES |  |  |
| `transport_mode` | TEXT |  | YES |  |  |
| `vehicle_number` | TEXT |  | YES |  |  |
| `lr_number` | TEXT |  | YES |  |  |
| `lr_date` | DATE |  | YES |  |  |
| `qc_required` | BOOLEAN |  | YES | true |  |
| `qc_status` | TEXT |  | YES | 'pending'::text |  |
| `qc_completed_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `qc_completed_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `qc_notes` | TEXT |  | YES |  |  |
| `supplier_amount` | NUMERIC(15,2) |  | YES |  |  |
| `calculated_amount` | NUMERIC(15,2) |  | YES |  |  |
| `variance_amount` | NUMERIC(15,2) |  | YES |  |  |
| `grn_status` | TEXT |  | YES | 'draft'::text |  |
| `approval_status` | TEXT |  | YES | 'pending'::text |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `stock_updated` | BOOLEAN |  | YES | false |  |
| `stock_updated_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `rejection_reason` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### procurement.grn_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `grn_item_id` | INTEGER(32) | PK | NO | nextval('procurement.grn_it... |  |
| `grn_id` | INTEGER(32) | FK→goods_receipt_notes | NO |  |  |
| `po_item_id` | INTEGER(32) | FK→purchase_order_items | YES |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `batch_number` | TEXT |  | NO |  |  |
| `manufacturing_date` | DATE |  | YES |  |  |
| `expiry_date` | DATE |  | NO |  |  |
| `ordered_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `received_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `accepted_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `rejected_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `free_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `uom` | TEXT |  | NO |  |  |
| `pack_type` | TEXT |  | NO |  |  |
| `pack_size` | INTEGER(32) |  | YES |  |  |
| `unit_price` | NUMERIC(15,4) |  | YES |  |  |
| `mrp` | NUMERIC(15,2) |  | NO |  |  |
| `ptr` | NUMERIC(15,2) |  | YES |  |  |
| `pts` | NUMERIC(15,2) |  | YES |  |  |
| `ptr_margin_percent` | NUMERIC(5,2) |  | YES |  |  |
| `pts_margin_percent` | NUMERIC(5,2) |  | YES |  |  |
| `qc_status` | TEXT |  | YES | 'pending'::text |  |
| `qc_notes` | TEXT |  | YES |  |  |
| `rejection_reason` | TEXT |  | YES |  |  |
| `storage_location_id` | INTEGER(32) | FK→storage_locations | YES |  |  |
| `item_status` | TEXT |  | YES | 'received'::text |  |
| `item_notes` | TEXT |  | YES |  |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `quantity_returned` | NUMERIC(18,3) |  | YES | 0 | Total quantity returned to supplier |

### procurement.grn_return_status

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `grn_id` | INTEGER(32) |  | YES |  |  |
| `grn_number` | TEXT |  | YES |  |  |
| `grn_date` | DATE |  | YES |  |  |
| `supplier_id` | INTEGER(32) |  | YES |  |  |
| `supplier_name` | TEXT |  | YES |  |  |
| `grn_amount` | NUMERIC |  | YES |  |  |
| `return_count` | BIGINT(64) |  | YES |  |  |
| `total_returned_amount` | NUMERIC |  | YES |  |  |
| `return_status` | TEXT |  | YES |  |  |
| `remaining_returnable_amount` | NUMERIC |  | YES |  |  |

### procurement.purchase_order_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `po_item_id` | INTEGER(32) | PK | NO | nextval('procurement.purcha... |  |
| `purchase_order_id` | INTEGER(32) | FK→purchase_orders | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `product_name` | TEXT |  | NO |  |  |
| `manufacturer` | TEXT |  | YES |  |  |
| `hsn_code` | TEXT |  | YES |  |  |
| `ordered_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `uom` | TEXT |  | NO |  |  |
| `pack_type` | TEXT |  | NO |  |  |
| `pack_size` | INTEGER(32) |  | YES |  |  |
| `base_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `free_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `scheme_details` | TEXT |  | YES |  |  |
| `unit_price` | NUMERIC(15,4) |  | NO |  |  |
| `mrp` | NUMERIC(15,2) |  | YES |  |  |
| `discount_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `discount_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `taxable_amount` | NUMERIC(15,2) |  | YES |  |  |
| `tax_percent` | NUMERIC(5,2) |  | YES |  |  |
| `tax_amount` | NUMERIC(15,2) |  | YES |  |  |
| `line_total` | NUMERIC(15,2) |  | NO |  |  |
| `received_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `pending_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `cancelled_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `bonus_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `item_status` | TEXT |  | YES | 'pending'::text |  |
| `item_notes` | TEXT |  | YES |  |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `batch_number` | CHARACTER VARYING(100) |  | YES |  |  |
| `expiry_date` | DATE |  | YES |  |  |
| `selling_price` | NUMERIC(15,2) |  | YES |  |  |

### procurement.purchase_orders

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `purchase_order_id` | INTEGER(32) | PK | NO | nextval('procurement.purcha... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `po_number` | TEXT |  | NO |  |  |
| `po_date` | DATE |  | NO | CURRENT_DATE |  |
| `po_type` | TEXT |  | YES | 'regular'::text |  |
| `supplier_id` | INTEGER(32) | FK→suppliers | NO |  |  |
| `supplier_name` | TEXT |  | NO |  |  |
| `supplier_reference` | TEXT |  | YES |  |  |
| `expected_delivery_date` | DATE |  | YES |  |  |
| `delivery_location_id` | INTEGER(32) | FK→storage_locations | YES |  |  |
| `delivery_terms` | TEXT |  | YES |  |  |
| `payment_terms` | TEXT |  | YES |  |  |
| `payment_days` | INTEGER(32) |  | YES |  |  |
| `due_date` | DATE |  | YES |  |  |
| `subtotal_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `discount_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `taxable_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `other_charges` | NUMERIC(15,2) |  | YES | 0 |  |
| `round_off_amount` | NUMERIC(5,2) |  | YES | 0 |  |
| `total_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `po_status` | TEXT |  | YES | 'draft'::text |  |
| `approval_status` | TEXT |  | YES | 'pending'::text |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `items_count` | INTEGER(32) |  | YES | 0 |  |
| `items_received` | INTEGER(32) |  | YES | 0 |  |
| `receipt_status` | TEXT |  | YES | 'pending'::text |  |
| `sent_to_supplier` | BOOLEAN |  | YES | false |  |
| `sent_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `acknowledged_by_supplier` | BOOLEAN |  | YES | false |  |
| `acknowledged_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `internal_notes` | TEXT |  | YES |  |  |
| `terms_and_conditions` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### procurement.purchase_requisition_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `requisition_item_id` | INTEGER(32) | PK | NO | nextval('procurement.purcha... |  |
| `requisition_id` | INTEGER(32) | FK→purchase_requisitions | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `requested_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `uom` | TEXT |  | NO |  |  |
| `current_stock` | NUMERIC(15,3) |  | YES |  |  |
| `reorder_level` | NUMERIC(15,3) |  | YES |  |  |
| `suggested_supplier_id` | INTEGER(32) | FK→suppliers | YES |  |  |
| `last_purchase_price` | NUMERIC(15,4) |  | YES |  |  |
| `approved_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `item_status` | TEXT |  | YES | 'pending'::text |  |
| `item_notes` | TEXT |  | YES |  |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### procurement.purchase_requisitions

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `requisition_id` | INTEGER(32) | PK | NO | nextval('procurement.purcha... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `requisition_number` | TEXT |  | NO |  |  |
| `requisition_date` | DATE |  | NO | CURRENT_DATE |  |
| `required_by_date` | DATE |  | YES |  |  |
| `requested_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `department` | TEXT |  | YES |  |  |
| `requisition_type` | TEXT |  | YES | 'stock'::text |  |
| `priority` | TEXT |  | YES | 'normal'::text |  |
| `approval_status` | TEXT |  | YES | 'pending'::text |  |
| `current_approver_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `approval_history` | JSONB |  | YES | '[]'::jsonb |  |
| `requisition_status` | TEXT |  | YES | 'draft'::text |  |
| `converted_to_po` | BOOLEAN |  | YES | false |  |
| `po_ids` | ARRAY |  | YES |  |  |
| `purpose` | TEXT |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `rejection_reason` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### procurement.purchase_return_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `return_item_id` | INTEGER(32) | PK | NO | nextval('procurement.purcha... |  |
| `return_id` | INTEGER(32) | FK→purchase_returns | NO |  |  |
| `grn_item_id` | INTEGER(32) | FK→grn_items | YES |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `batch_id` | INTEGER(32) | FK→batches | YES |  |  |
| `batch_number` | TEXT |  | NO |  |  |
| `return_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `uom` | TEXT |  | NO |  |  |
| `unit_price` | NUMERIC(15,4) |  | YES |  |  |
| `return_value` | NUMERIC(15,2) |  | YES |  |  |
| `tax_amount` | NUMERIC(15,2) |  | YES |  |  |
| `item_return_reason` | TEXT |  | YES |  |  |
| `item_status` | TEXT |  | YES | 'pending'::text |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `disposition` | TEXT |  | YES | 'RETURN_TO_SUPPLIER'::text | RETURN_TO_SUPPLIER, DESTROY, QUARANTINE |
| `damaged_quantity` | NUMERIC(15,3) |  | YES | 0 | Quantity that is damaged/unsaleable |
| `saleable_quantity` | NUMERIC(15,3) |  | YES | 0 | Quantity that can be resold if kept |
| `supplier_invoice_item_id` | INTEGER(32) | FK→supplier_invoice_items | YES |  | Reference to supplier invoice line item |

### procurement.purchase_returns

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `return_id` | INTEGER(32) | PK | NO | nextval('procurement.purcha... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `return_number` | TEXT |  | NO |  |  |
| `return_date` | DATE |  | NO | CURRENT_DATE |  |
| `return_type` | TEXT |  | NO |  |  |
| `grn_id` | INTEGER(32) | FK→goods_receipt_notes | YES |  |  |
| `supplier_invoice_id` | INTEGER(32) | FK→supplier_invoices | YES |  |  |
| `supplier_id` | INTEGER(32) | FK→suppliers | NO |  |  |
| `return_reason` | TEXT |  | NO |  |  |
| `detailed_reason` | TEXT |  | YES |  |  |
| `approval_required` | BOOLEAN |  | YES | true |  |
| `approval_status` | TEXT |  | YES | 'pending'::text |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `return_amount` | NUMERIC(15,2) |  | YES |  |  |
| `tax_amount` | NUMERIC(15,2) |  | YES |  |  |
| `total_amount` | NUMERIC(15,2) |  | YES |  |  |
| `debit_note_number` | TEXT |  | YES |  |  |
| `debit_note_date` | DATE |  | YES |  |  |
| `debit_note_status` | TEXT |  | YES | 'pending'::text |  |
| `igst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `supplier_acknowledged` | BOOLEAN |  | YES | false |  |
| `supplier_acknowledgment_date` | DATE |  | YES |  |  |
| `supplier_credit_note_number` | TEXT |  | YES |  |  |
| `dispatch_date` | DATE |  | YES |  |  |
| `transport_details` | JSONB |  | YES |  |  |
| `adjustment_type` | TEXT |  | YES |  |  |
| `adjusted_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `pending_amount` | NUMERIC(15,2) |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### procurement.supplier_invoice_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `invoice_item_id` | INTEGER(32) | PK | NO | nextval('procurement.suppli... |  |
| `supplier_invoice_id` | INTEGER(32) | FK→supplier_invoices | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `batch_id` | INTEGER(32) | FK→batches | YES |  |  |
| `batch_number` | TEXT |  | YES |  |  |
| `quantity` | NUMERIC(18,3) |  | NO |  |  |
| `free_quantity` | NUMERIC(18,3) |  | YES | 0 |  |
| `unit_price` | NUMERIC(15,4) |  | NO |  |  |
| `discount_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `discount_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `taxable_amount` | NUMERIC(15,2) |  | NO |  |  |
| `cgst_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `sgst_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `igst_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_amount` | NUMERIC(15,2) |  | NO |  |  |
| `hsn_code` | TEXT |  | YES |  |  |
| `unit` | TEXT |  | YES | 'PCS'::text |  |
| `pack_type` | TEXT |  | YES |  |  |
| `pack_size` | INTEGER(32) |  | YES | 1 |  |
| `quantity_returned` | NUMERIC(18,3) |  | YES | 0 |  |
| `grn_item_id` | INTEGER(32) | FK→grn_items | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### procurement.supplier_invoice_return_status

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `supplier_invoice_id` | INTEGER(32) |  | YES |  |  |
| `supplier_invoice_number` | TEXT |  | YES |  |  |
| `invoice_date` | DATE |  | YES |  |  |
| `supplier_id` | INTEGER(32) |  | YES |  |  |
| `supplier_name` | TEXT |  | YES |  |  |
| `invoice_amount` | NUMERIC(15,2) |  | YES |  |  |
| `return_count` | BIGINT(64) |  | YES |  |  |
| `total_returned_amount` | NUMERIC |  | YES |  |  |
| `return_status` | TEXT |  | YES |  |  |
| `remaining_returnable_amount` | NUMERIC |  | YES |  |  |

### procurement.supplier_invoices

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `supplier_invoice_id` | INTEGER(32) | PK | NO | nextval('procurement.suppli... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `supplier_invoice_number` | TEXT |  | NO |  |  |
| `invoice_date` | DATE |  | NO |  |  |
| `supplier_id` | INTEGER(32) | FK→suppliers | NO |  |  |
| `purchase_order_ids` | ARRAY |  | YES |  |  |
| `grn_ids` | ARRAY |  | YES |  |  |
| `subtotal_amount` | NUMERIC(15,2) |  | NO |  |  |
| `discount_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `taxable_amount` | NUMERIC(15,2) |  | NO |  |  |
| `igst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_amount` | NUMERIC(15,2) |  | NO |  |  |
| `freight_charges` | NUMERIC(15,2) |  | YES | 0 |  |
| `insurance_charges` | NUMERIC(15,2) |  | YES | 0 |  |
| `other_charges` | NUMERIC(15,2) |  | YES | 0 |  |
| `round_off_amount` | NUMERIC(5,2) |  | YES | 0 |  |
| `invoice_total` | NUMERIC(15,2) |  | NO |  |  |
| `tds_applicable` | BOOLEAN |  | YES | false |  |
| `tds_percent` | NUMERIC(5,2) |  | YES |  |  |
| `tds_amount` | NUMERIC(15,2) |  | YES |  |  |
| `payment_terms` | TEXT |  | YES |  |  |
| `due_date` | DATE |  | YES |  |  |
| `payment_status` | TEXT |  | YES | 'pending'::text |  |
| `paid_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `gstr2a_matched` | BOOLEAN |  | YES | false |  |
| `gstr2a_match_date` | DATE |  | YES |  |  |
| `itc_eligible` | BOOLEAN |  | YES | true |  |
| `matching_status` | TEXT |  | YES | 'pending'::text |  |
| `invoice_status` | TEXT |  | YES | 'draft'::text |  |
| `verified_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `verified_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `rejection_reason` | TEXT |  | YES |  |  |
| `invoice_document_path` | TEXT |  | YES |  |  |
| `supporting_documents` | JSONB |  | YES | '[]'::jsonb |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### procurement.supplier_quotation_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `quotation_item_id` | INTEGER(32) | PK | NO | nextval('procurement.suppli... |  |
| `quotation_id` | INTEGER(32) | FK→supplier_quotations | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `quantity` | NUMERIC(15,3) |  | NO |  |  |
| `uom` | TEXT |  | NO |  |  |
| `unit_price` | NUMERIC(15,4) |  | NO |  |  |
| `discount_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `free_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `tax_percent` | NUMERIC(5,2) |  | YES |  |  |
| `line_total` | NUMERIC(15,2) |  | YES |  |  |
| `is_best_price` | BOOLEAN |  | YES | false |  |
| `price_variance_percent` | NUMERIC(5,2) |  | YES |  |  |
| `item_notes` | TEXT |  | YES |  |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### procurement.supplier_quotations

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `quotation_id` | INTEGER(32) | PK | NO | nextval('procurement.suppli... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `quotation_number` | TEXT |  | NO |  |  |
| `quotation_date` | DATE |  | NO |  |  |
| `supplier_id` | INTEGER(32) | FK→suppliers | NO |  |  |
| `requisition_id` | INTEGER(32) | FK→purchase_requisitions | YES |  |  |
| `rfq_number` | TEXT |  | YES |  |  |
| `valid_until` | DATE |  | YES |  |  |
| `payment_terms` | TEXT |  | YES |  |  |
| `delivery_terms` | TEXT |  | YES |  |  |
| `other_terms` | TEXT |  | YES |  |  |
| `total_amount` | NUMERIC(15,2) |  | YES |  |  |
| `quotation_status` | TEXT |  | YES | 'received'::text |  |
| `is_best_price` | BOOLEAN |  | YES | false |  |
| `price_rank` | INTEGER(32) |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### procurement.vendor_performance

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `performance_id` | INTEGER(32) | PK | NO | nextval('procurement.vendor... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `supplier_id` | INTEGER(32) | FK→suppliers | NO |  |  |
| `evaluation_period` | TEXT |  | NO |  |  |
| `period_start` | DATE |  | NO |  |  |
| `period_end` | DATE |  | NO |  |  |
| `total_orders` | INTEGER(32) |  | YES | 0 |  |
| `on_time_deliveries` | INTEGER(32) |  | YES | 0 |  |
| `late_deliveries` | INTEGER(32) |  | YES | 0 |  |
| `on_time_delivery_percent` | NUMERIC(5,2) |  | YES |  |  |
| `total_items_received` | INTEGER(32) |  | YES | 0 |  |
| `items_rejected` | INTEGER(32) |  | YES | 0 |  |
| `rejection_rate_percent` | NUMERIC(5,2) |  | YES |  |  |
| `quality_issues_count` | INTEGER(32) |  | YES | 0 |  |
| `total_purchase_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `invoice_accuracy_percent` | NUMERIC(5,2) |  | YES |  |  |
| `payment_term_adherence` | NUMERIC(5,2) |  | YES |  |  |
| `return_count` | INTEGER(32) |  | YES | 0 |  |
| `return_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `return_rate_percent` | NUMERIC(5,2) |  | YES |  |  |
| `delivery_rating` | NUMERIC(3,2) |  | YES |  |  |
| `quality_rating` | NUMERIC(3,2) |  | YES |  |  |
| `price_rating` | NUMERIC(3,2) |  | YES |  |  |
| `service_rating` | NUMERIC(3,2) |  | YES |  |  |
| `overall_rating` | NUMERIC(3,2) |  | YES |  |  |
| `evaluation_status` | TEXT |  | YES | 'pending'::text |  |
| `reviewed_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `reviewed_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `review_notes` | TEXT |  | YES |  |  |
| `improvement_areas` | ARRAY |  | YES |  |  |
| `action_required` | BOOLEAN |  | YES | false |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

## financial

**Tables:** `bank_reconciliation_items`, `bank_reconciliations`, `cash_flow_forecast`, `chart_of_accounts`, `customer_outstanding`, `expense_categories`, `expense_claim_items`, `expense_claims`, `journal_entries`, `journal_entry_lines`, `payment_allocations`, `payment_methods`, `payments`, `pdc_management`, `supplier_outstanding`, `unmatched_transactions`

### financial.bank_reconciliation_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `item_id` | INTEGER(32) | PK | NO | nextval('financial.bank_rec... |  |
| `reconciliation_id` | INTEGER(32) | FK→bank_reconciliations | NO |  |  |
| `transaction_type` | TEXT |  | NO |  |  |
| `transaction_id` | INTEGER(32) |  | YES |  |  |
| `transaction_date` | DATE |  | NO |  |  |
| `transaction_amount` | NUMERIC(15,2) |  | NO |  |  |
| `is_reconciled` | BOOLEAN |  | YES | false |  |
| `reconciled_amount` | NUMERIC(15,2) |  | YES |  |  |
| `statement_reference` | TEXT |  | YES |  |  |
| `statement_date` | DATE |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### financial.bank_reconciliations

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `reconciliation_id` | INTEGER(32) | PK | NO | nextval('financial.bank_rec... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `bank_account_id` | INTEGER(32) | FK→org_bank_accounts | NO |  |  |
| `reconciliation_date` | DATE |  | NO |  |  |
| `from_date` | DATE |  | NO |  |  |
| `to_date` | DATE |  | NO |  |  |
| `statement_balance` | NUMERIC(15,2) |  | NO |  |  |
| `statement_date` | DATE |  | NO |  |  |
| `book_balance` | NUMERIC(15,2) |  | NO |  |  |
| `uncleared_deposits` | NUMERIC(15,2) |  | YES | 0 |  |
| `uncleared_payments` | NUMERIC(15,2) |  | YES | 0 |  |
| `adjusted_book_balance` | NUMERIC(15,2) |  | YES |  |  |
| `difference` | NUMERIC(15,2) |  | YES |  |  |
| `reconciliation_status` | TEXT |  | YES | 'draft'::text |  |
| `completed_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `completed_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### financial.cash_flow_forecast

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `forecast_id` | INTEGER(32) | PK | NO | nextval('financial.cash_flo... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `forecast_date` | DATE |  | NO |  |  |
| `forecast_type` | TEXT |  | NO |  |  |
| `opening_balance` | NUMERIC(15,2) |  | NO |  |  |
| `customer_collections` | NUMERIC(15,2) |  | YES | 0 |  |
| `other_income` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_inflows` | NUMERIC(15,2) |  | YES | 0 |  |
| `supplier_payments` | NUMERIC(15,2) |  | YES | 0 |  |
| `salary_payments` | NUMERIC(15,2) |  | YES | 0 |  |
| `other_expenses` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_outflows` | NUMERIC(15,2) |  | YES | 0 |  |
| `projected_closing_balance` | NUMERIC(15,2) |  | YES |  |  |
| `minimum_required_balance` | NUMERIC(15,2) |  | YES |  |  |
| `surplus_deficit` | NUMERIC(15,2) |  | YES |  |  |
| `actual_inflows` | NUMERIC(15,2) |  | YES |  |  |
| `actual_outflows` | NUMERIC(15,2) |  | YES |  |  |
| `actual_closing_balance` | NUMERIC(15,2) |  | YES |  |  |
| `variance` | NUMERIC(15,2) |  | YES |  |  |
| `forecast_status` | TEXT |  | YES | 'projected'::text |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### financial.chart_of_accounts

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `account_id` | INTEGER(32) | PK | NO | nextval('financial.chart_of... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `parent_account_id` | INTEGER(32) | FK→chart_of_accounts | YES |  |  |
| `account_code` | TEXT |  | NO |  |  |
| `account_name` | TEXT |  | NO |  |  |
| `account_type` | TEXT |  | NO |  |  |
| `account_subtype` | TEXT |  | YES |  |  |
| `is_group` | BOOLEAN |  | YES | false |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `is_system_account` | BOOLEAN |  | YES | false |  |
| `normal_balance` | TEXT |  | NO |  |  |
| `current_balance` | NUMERIC(15,2) |  | YES | 0 |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### financial.customer_outstanding

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `outstanding_id` | INTEGER(32) | PK | NO | nextval('financial.customer... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `customer_id` | INTEGER(32) | FK→customers | NO |  |  |
| `document_type` | TEXT |  | NO |  |  |
| `document_id` | INTEGER(32) |  | NO |  |  |
| `document_number` | TEXT |  | NO |  |  |
| `document_date` | DATE |  | NO |  |  |
| `original_amount` | NUMERIC(15,2) |  | NO |  |  |
| `outstanding_amount` | NUMERIC(15,2) |  | NO |  |  |
| `paid_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `due_date` | DATE |  | YES |  |  |
| `days_overdue` | INTEGER(32) |  | YES | 0 |  |
| `aging_bucket` | TEXT |  | YES | 'current'::text |  |
| `status` | TEXT |  | YES | 'open'::text |  |
| `promised_date` | DATE |  | YES |  |  |
| `follow_up_date` | DATE |  | YES |  |  |
| `collection_notes` | TEXT |  | YES |  |  |
| `write_off_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `write_off_date` | DATE |  | YES |  |  |
| `write_off_reason` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### financial.expense_categories

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `category_id` | INTEGER(32) | PK | NO | nextval('financial.expense_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `parent_category_id` | INTEGER(32) | FK→expense_categories | YES |  |  |
| `category_code` | TEXT |  | NO |  |  |
| `category_name` | TEXT |  | NO |  |  |
| `expense_account_id` | INTEGER(32) | FK→chart_of_accounts | YES |  |  |
| `monthly_budget` | NUMERIC(15,2) |  | YES |  |  |
| `quarterly_budget` | NUMERIC(15,2) |  | YES |  |  |
| `annual_budget` | NUMERIC(15,2) |  | YES |  |  |
| `requires_approval` | BOOLEAN |  | YES | false |  |
| `approval_limit` | NUMERIC(15,2) |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### financial.expense_claim_items

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `claim_item_id` | INTEGER(32) | PK | NO | nextval('financial.expense_... |  |
| `claim_id` | INTEGER(32) | FK→expense_claims | NO |  |  |
| `expense_date` | DATE |  | NO |  |  |
| `category_id` | INTEGER(32) | FK→expense_categories | NO |  |  |
| `expense_description` | TEXT |  | NO |  |  |
| `claimed_amount` | NUMERIC(15,2) |  | NO |  |  |
| `approved_amount` | NUMERIC(15,2) |  | YES |  |  |
| `bill_number` | TEXT |  | YES |  |  |
| `bill_date` | DATE |  | YES |  |  |
| `vendor_name` | TEXT |  | YES |  |  |
| `attachment_path` | TEXT |  | YES |  |  |
| `item_status` | TEXT |  | YES | 'pending'::text |  |
| `rejection_reason` | TEXT |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### financial.expense_claims

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `claim_id` | INTEGER(32) | PK | NO | nextval('financial.expense_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `claim_number` | TEXT |  | NO |  |  |
| `claim_date` | DATE |  | NO |  |  |
| `employee_id` | INTEGER(32) | FK→org_users | NO |  |  |
| `department` | TEXT |  | YES |  |  |
| `expense_from_date` | DATE |  | YES |  |  |
| `expense_to_date` | DATE |  | YES |  |  |
| `total_amount` | NUMERIC(15,2) |  | NO |  |  |
| `approved_amount` | NUMERIC(15,2) |  | YES |  |  |
| `advance_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `payable_amount` | NUMERIC(15,2) |  | YES |  |  |
| `claim_status` | TEXT |  | YES | 'draft'::text |  |
| `submitted_date` | DATE |  | YES |  |  |
| `current_approver_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `approval_history` | JSONB |  | YES | '[]'::jsonb |  |
| `payment_status` | TEXT |  | YES | 'pending'::text |  |
| `payment_id` | INTEGER(32) | FK→payments | YES |  |  |
| `paid_date` | DATE |  | YES |  |  |
| `purpose` | TEXT |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `rejection_reason` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### financial.journal_entries

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `journal_id` | INTEGER(32) | PK | NO | nextval('financial.journal_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `journal_number` | TEXT |  | NO |  |  |
| `journal_date` | DATE |  | NO |  |  |
| `journal_type` | TEXT |  | NO |  |  |
| `reference_type` | TEXT |  | YES |  |  |
| `reference_id` | INTEGER(32) |  | YES |  |  |
| `reference_number` | TEXT |  | YES |  |  |
| `entry_status` | TEXT |  | YES | 'draft'::text |  |
| `posted_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `posted_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `is_reversal` | BOOLEAN |  | YES | false |  |
| `reversal_of_journal_id` | INTEGER(32) | FK→journal_entries | YES |  |  |
| `narration` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### financial.journal_entry_lines

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `line_id` | INTEGER(32) | PK | NO | nextval('financial.journal_... |  |
| `journal_id` | INTEGER(32) | FK→journal_entries | NO |  |  |
| `account_code` | TEXT |  | NO |  |  |
| `account_name` | TEXT |  | NO |  |  |
| `debit_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `credit_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `party_type` | TEXT |  | YES |  |  |
| `party_id` | INTEGER(32) |  | YES |  |  |
| `cost_center_id` | INTEGER(32) |  | YES |  |  |
| `line_narration` | TEXT |  | YES |  |  |
| `display_order` | INTEGER(32) |  | YES |  |  |

### financial.payment_allocations

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `allocation_id` | INTEGER(32) | PK | NO | nextval('financial.payment_... |  |
| `payment_id` | INTEGER(32) | FK→payments | NO |  |  |
| `reference_type` | TEXT |  | NO |  |  |
| `reference_id` | INTEGER(32) |  | NO |  |  |
| `reference_number` | TEXT |  | NO |  |  |
| `allocated_amount` | NUMERIC(15,2) |  | NO |  |  |
| `discount_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `write_off_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `allocation_status` | TEXT |  | YES | 'active'::text |  |
| `reversed_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `reversed_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `reversal_reason` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### financial.payment_methods

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `payment_method_id` | INTEGER(32) | PK | NO | nextval('financial.payment_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `method_code` | TEXT |  | NO |  |  |
| `method_name` | TEXT |  | NO |  |  |
| `method_type` | TEXT |  | NO |  |  |
| `requires_reference` | BOOLEAN |  | YES | false |  |
| `requires_approval` | BOOLEAN |  | YES | false |  |
| `default_bank_account_id` | INTEGER(32) | FK→org_bank_accounts | YES |  |  |
| `processing_days` | INTEGER(32) |  | YES | 0 |  |
| `transaction_charge_percent` | NUMERIC(5,2) |  | YES | 0 |  |
| `transaction_charge_fixed` | NUMERIC(15,2) |  | YES | 0 |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### financial.payments

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `payment_id` | INTEGER(32) | PK | NO | nextval('financial.payments... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `payment_number` | TEXT |  | NO |  |  |
| `payment_date` | DATE |  | NO | CURRENT_DATE |  |
| `payment_type` | TEXT |  | NO |  |  |
| `party_type` | TEXT |  | NO |  |  |
| `party_id` | INTEGER(32) |  | YES |  |  |
| `party_name` | TEXT |  | NO |  |  |
| `payment_amount` | NUMERIC(15,2) |  | NO |  |  |
| `payment_method_id` | INTEGER(32) | FK→payment_methods | NO |  |  |
| `reference_number` | TEXT |  | YES |  |  |
| `reference_date` | DATE |  | YES |  |  |
| `bank_account_id` | INTEGER(32) | FK→org_bank_accounts | YES |  |  |
| `deposited_at_bank` | TEXT |  | YES |  |  |
| `payment_status` | TEXT |  | YES | 'pending'::text |  |
| `clearance_date` | DATE |  | YES |  |  |
| `requires_approval` | BOOLEAN |  | YES | false |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `allocation_status` | TEXT |  | YES | 'unallocated'::text |  |
| `allocated_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `unallocated_amount` | NUMERIC(15,2) |  | YES |  |  |
| `narration` | TEXT |  | YES |  |  |
| `internal_notes` | TEXT |  | YES |  |  |
| `is_pdc` | BOOLEAN |  | YES | false |  |
| `pdc_status` | TEXT |  | YES |  |  |
| `is_cancelled` | BOOLEAN |  | YES | false |  |
| `cancellation_reason` | TEXT |  | YES |  |  |
| `cancelled_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `cancelled_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `reconciliation_id` | INTEGER(32) |  | YES |  |  |

### financial.pdc_management

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `pdc_id` | INTEGER(32) | PK | NO | nextval('financial.pdc_mana... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `payment_id` | INTEGER(32) | FK→payments | YES |  |  |
| `cheque_number` | TEXT |  | NO |  |  |
| `cheque_date` | DATE |  | NO |  |  |
| `bank_name` | TEXT |  | NO |  |  |
| `party_type` | TEXT |  | NO |  |  |
| `party_id` | INTEGER(32) |  | NO |  |  |
| `party_name` | TEXT |  | NO |  |  |
| `cheque_amount` | NUMERIC(15,2) |  | NO |  |  |
| `pdc_type` | TEXT |  | NO |  |  |
| `pdc_status` | TEXT |  | YES | 'pending'::text |  |
| `deposit_date` | DATE |  | YES |  |  |
| `clearance_date` | DATE |  | YES |  |  |
| `bounce_count` | INTEGER(32) |  | YES | 0 |  |
| `bounce_charges` | NUMERIC(15,2) |  | YES | 0 |  |
| `bounce_reason` | TEXT |  | YES |  |  |
| `cheque_location` | TEXT |  | YES | 'in_hand'::text |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### financial.supplier_outstanding

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `outstanding_id` | INTEGER(32) | PK | NO | nextval('financial.supplier... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `supplier_id` | INTEGER(32) | FK→suppliers | NO |  |  |
| `document_type` | TEXT |  | NO |  |  |
| `document_id` | INTEGER(32) |  | NO |  |  |
| `document_number` | TEXT |  | NO |  |  |
| `document_date` | DATE |  | NO |  |  |
| `original_amount` | NUMERIC(15,2) |  | NO |  |  |
| `outstanding_amount` | NUMERIC(15,2) |  | NO |  |  |
| `paid_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `due_date` | DATE |  | YES |  |  |
| `days_until_due` | INTEGER(32) |  | YES | 0 |  |
| `status` | TEXT |  | YES | 'open'::text |  |
| `planned_payment_date` | DATE |  | YES |  |  |
| `payment_priority` | TEXT |  | YES | 'normal'::text |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### financial.unmatched_transactions

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `transaction_id` | INTEGER(32) | PK | NO | nextval('financial.unmatche... |  |
| `reconciliation_id` | INTEGER(32) | FK→bank_reconciliations | YES |  |  |
| `transaction_date` | DATE |  | NO |  |  |
| `description` | TEXT |  | YES |  |  |
| `amount` | NUMERIC(15,2) |  | NO |  |  |
| `transaction_type` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

## gst

**Tables:** `advance_receipts`, `compliance_calendar`, `eway_bills`, `gst_audit_trail`, `gst_credit_ledger`, `gst_liability`, `gst_rates`, `gst_reconciliation`, `gstr1_data`, `gstr2a_data`, `gstr2b_data`, `gstr3b_data`, `hsn_sac_codes`, `purchase_reconciliation`, `return_filing_status`

### gst.advance_receipts

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `advance_id` | INTEGER(32) | PK | NO | nextval('gst.advance_receip... |  |
| `org_id` | INTEGER(32) |  | NO |  |  |
| `branch_id` | INTEGER(32) |  | YES |  |  |
| `customer_id` | INTEGER(32) |  | YES |  |  |
| `receipt_date` | DATE |  | YES |  |  |
| `advance_amount` | NUMERIC(15,2) |  | YES |  |  |
| `place_of_supply` | TEXT |  | YES |  |  |
| `gst_rate` | NUMERIC(5,2) |  | YES |  |  |
| `igst_amount` | NUMERIC(15,2) |  | YES |  |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES |  |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES |  |  |
| `cess_amount` | NUMERIC(15,2) |  | YES |  |  |
| `adjustment_status` | TEXT |  | YES | 'pending'::text |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### gst.compliance_calendar

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `calendar_id` | INTEGER(32) | PK | NO | nextval('gst.compliance_cal... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `compliance_type` | TEXT |  | NO |  |  |
| `period` | TEXT |  | NO |  |  |
| `due_date` | DATE |  | NO |  |  |
| `extended_due_date` | DATE |  | YES |  |  |
| `compliance_status` | TEXT |  | YES | 'pending'::text |  |
| `completed_date` | DATE |  | YES |  |  |
| `reminder_days` | ARRAY |  | YES | '{7,3,1}'::integer[] |  |
| `reminders_sent` | INTEGER(32) |  | YES | 0 |  |
| `last_reminder_date` | DATE |  | YES |  |  |
| `assigned_to` | INTEGER(32) | FK→org_users | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### gst.eway_bills

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `eway_bill_id` | INTEGER(32) | PK | NO | nextval('gst.eway_bills_ewa... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `eway_bill_number` | TEXT |  | YES |  |  |
| `eway_bill_date` | DATE |  | NO |  |  |
| `document_type` | TEXT |  | NO |  |  |
| `document_id` | INTEGER(32) |  | NO |  |  |
| `document_number` | TEXT |  | NO |  |  |
| `supply_type` | TEXT |  | NO |  |  |
| `sub_supply_type` | TEXT |  | NO |  |  |
| `from_gstin` | TEXT |  | NO |  |  |
| `from_address` | TEXT |  | NO |  |  |
| `from_place` | TEXT |  | NO |  |  |
| `from_pincode` | TEXT |  | NO |  |  |
| `from_state_code` | TEXT |  | NO |  |  |
| `to_gstin` | TEXT |  | YES |  |  |
| `to_address` | TEXT |  | NO |  |  |
| `to_place` | TEXT |  | NO |  |  |
| `to_pincode` | TEXT |  | NO |  |  |
| `to_state_code` | TEXT |  | NO |  |  |
| `total_value` | NUMERIC(15,2) |  | NO |  |  |
| `taxable_value` | NUMERIC(15,2) |  | NO |  |  |
| `cgst_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `transport_mode` | TEXT |  | NO |  |  |
| `transport_distance` | INTEGER(32) |  | YES |  |  |
| `transporter_name` | TEXT |  | YES |  |  |
| `transporter_id` | TEXT |  | YES |  |  |
| `transport_doc_number` | TEXT |  | YES |  |  |
| `transport_doc_date` | DATE |  | YES |  |  |
| `vehicle_number` | TEXT |  | YES |  |  |
| `vehicle_type` | TEXT |  | YES |  |  |
| `valid_from` | TIMESTAMP WITH TIME ZONE |  | NO |  |  |
| `valid_until` | TIMESTAMP WITH TIME ZONE |  | NO |  |  |
| `eway_bill_status` | TEXT |  | YES | 'active'::text |  |
| `cancellation_reason` | TEXT |  | YES |  |  |
| `cancelled_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `extended` | BOOLEAN |  | YES | false |  |
| `extension_reason` | TEXT |  | YES |  |  |
| `extended_validity` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### gst.gst_audit_trail

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `audit_id` | INTEGER(32) | PK | NO | nextval('gst.gst_audit_trai... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `activity_date` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `activity_type` | TEXT |  | NO |  |  |
| `return_type` | TEXT |  | YES |  |  |
| `return_period` | TEXT |  | YES |  |  |
| `reference_number` | TEXT |  | YES |  |  |
| `activity_description` | TEXT |  | NO |  |  |
| `old_values` | JSONB |  | YES |  |  |
| `new_values` | JSONB |  | YES |  |  |
| `performed_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `ip_address` | INET |  | YES |  |  |
| `user_agent` | TEXT |  | YES |  |  |
| `activity_status` | TEXT |  | YES | 'success'::text |  |
| `error_message` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### gst.gst_credit_ledger

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `ledger_id` | INTEGER(32) | PK | NO | nextval('gst.gst_credit_led... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `transaction_date` | DATE |  | NO |  |  |
| `transaction_type` | TEXT |  | NO |  |  |
| `reference_type` | TEXT |  | YES |  |  |
| `reference_id` | INTEGER(32) |  | YES |  |  |
| `reference_number` | TEXT |  | YES |  |  |
| `description` | TEXT |  | NO |  |  |
| `igst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_balance` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_balance` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_balance` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_balance` | NUMERIC(15,2) |  | YES | 0 |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### gst.gst_liability

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `liability_id` | INTEGER(32) | PK | NO | nextval('gst.gst_liability_... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `tax_period` | TEXT |  | NO |  |  |
| `due_date` | DATE |  | NO |  |  |
| `igst_liability` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_liability` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_liability` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_liability` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_itc_available` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_itc_available` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_itc_available` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_itc_available` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_itc_utilized` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_itc_utilized` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_itc_utilized` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_itc_utilized` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_cash_required` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_cash_required` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_cash_required` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_cash_required` | NUMERIC(15,2) |  | YES | 0 |  |
| `interest_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `late_fee` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_liability` | NUMERIC(15,2) |  | YES | 0 |  |
| `balance_payable` | NUMERIC(15,2) |  | YES | 0 |  |
| `payment_status` | TEXT |  | YES | 'pending'::text |  |
| `paid_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `payment_date` | DATE |  | YES |  |  |
| `payment_reference` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### gst.gst_rates

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `rate_id` | INTEGER(32) | PK | NO | nextval('gst.gst_rates_rate... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | YES |  |  |
| `product_category_id` | INTEGER(32) | FK→product_categories | YES |  |  |
| `igst_rate` | NUMERIC(5,2) |  | NO |  |  |
| `cgst_rate` | NUMERIC(5,2) |  | NO |  |  |
| `sgst_rate` | NUMERIC(5,2) |  | NO |  |  |
| `cess_rate` | NUMERIC(5,2) |  | YES | 0 |  |
| `effective_from` | DATE |  | NO |  |  |
| `effective_until` | DATE |  | YES |  |  |
| `notification_number` | TEXT |  | YES |  |  |
| `notification_date` | DATE |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |

### gst.gst_reconciliation

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `reconciliation_id` | INTEGER(32) | PK | NO | nextval('gst.gst_reconcilia... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `reconciliation_type` | TEXT |  | NO |  |  |
| `period` | TEXT |  | NO |  |  |
| `books_data` | JSONB |  | NO |  |  |
| `gst_return_data` | JSONB |  | NO |  |  |
| `invoice_count_variance` | INTEGER(32) |  | YES | 0 |  |
| `taxable_value_variance` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_variance` | NUMERIC(15,2) |  | YES | 0 |  |
| `matched_items` | JSONB |  | YES | '[]'::jsonb |  |
| `unmatched_in_books` | JSONB |  | YES | '[]'::jsonb |  |
| `unmatched_in_return` | JSONB |  | YES | '[]'::jsonb |  |
| `reconciliation_status` | TEXT |  | YES | 'pending'::text |  |
| `actions_taken` | JSONB |  | YES | '[]'::jsonb |  |
| `reviewed_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `reviewed_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### gst.gstr1_data

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `gstr1_id` | INTEGER(32) | PK | NO | nextval('gst.gstr1_data_gst... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `return_period` | TEXT |  | NO |  |  |
| `financial_year` | TEXT |  | NO |  |  |
| `b2b_supplies` | JSONB |  | YES | '[]'::jsonb |  |
| `b2b_invoice_count` | INTEGER(32) |  | YES | 0 |  |
| `b2b_taxable_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `b2b_tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `b2cl_supplies` | JSONB |  | YES | '[]'::jsonb |  |
| `b2cl_invoice_count` | INTEGER(32) |  | YES | 0 |  |
| `b2cl_taxable_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `b2cl_tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `b2cs_taxable_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `b2cs_tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cdn_documents` | JSONB |  | YES | '[]'::jsonb |  |
| `cdn_count` | INTEGER(32) |  | YES | 0 |  |
| `cdn_taxable_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `cdn_tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `exp_supplies` | JSONB |  | YES | '[]'::jsonb |  |
| `exp_invoice_count` | INTEGER(32) |  | YES | 0 |  |
| `exp_taxable_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `nil_rated_supplies` | JSONB |  | YES | '{}'::jsonb |  |
| `hsn_summary` | JSONB |  | YES | '[]'::jsonb |  |
| `doc_summary` | JSONB |  | YES | '{}'::jsonb |  |
| `total_taxable_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `filing_status` | TEXT |  | YES | 'draft'::text |  |
| `filed_date` | DATE |  | YES |  |  |
| `arn_number` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |

### gst.gstr2a_data

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `gstr2a_id` | INTEGER(32) | PK | NO | nextval('gst.gstr2a_data_gs... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `return_period` | TEXT |  | NO |  |  |
| `downloaded_date` | DATE |  | NO |  |  |
| `download_status` | TEXT |  | YES | 'success'::text |  |
| `b2b_invoices` | JSONB |  | YES | '[]'::jsonb |  |
| `b2b_count` | INTEGER(32) |  | YES | 0 |  |
| `b2b_taxable_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `b2b_tax_amount` | NUMERIC(15,2) |  | YES | 0 |  |
| `cdn_documents` | JSONB |  | YES | '[]'::jsonb |  |
| `cdn_count` | INTEGER(32) |  | YES | 0 |  |
| `isd_credits` | JSONB |  | YES | '[]'::jsonb |  |
| `reconciliation_status` | TEXT |  | YES | 'pending'::text |  |
| `matched_invoices` | INTEGER(32) |  | YES | 0 |  |
| `unmatched_invoices` | INTEGER(32) |  | YES | 0 |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### gst.gstr2b_data

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `gstr2b_id` | INTEGER(32) | PK | NO | nextval('gst.gstr2b_data_gs... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `return_period` | TEXT |  | NO |  |  |
| `generation_date` | DATE |  | NO |  |  |
| `total_itc_available` | NUMERIC(15,2) |  | YES | 0 |  |
| `igst_itc` | NUMERIC(15,2) |  | YES | 0 |  |
| `cgst_itc` | NUMERIC(15,2) |  | YES | 0 |  |
| `sgst_itc` | NUMERIC(15,2) |  | YES | 0 |  |
| `cess_itc` | NUMERIC(15,2) |  | YES | 0 |  |
| `itc_unavailable` | NUMERIC(15,2) |  | YES | 0 |  |
| `import_goods_itc` | NUMERIC(15,2) |  | YES | 0 |  |
| `isd_itc` | NUMERIC(15,2) |  | YES | 0 |  |
| `ineligible_itc` | NUMERIC(15,2) |  | YES | 0 |  |
| `itc_reversal` | NUMERIC(15,2) |  | YES | 0 |  |
| `net_itc` | NUMERIC(15,2) |  | YES | 0 |  |
| `download_status` | TEXT |  | YES | 'pending'::text |  |
| `downloaded_date` | DATE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### gst.gstr3b_data

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `gstr3b_id` | INTEGER(32) | PK | NO | nextval('gst.gstr3b_data_gs... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `return_period` | TEXT |  | NO |  |  |
| `outward_taxable_supplies` | NUMERIC(15,2) |  | YES | 0 |  |
| `outward_zero_rated` | NUMERIC(15,2) |  | YES | 0 |  |
| `outward_nil_rated` | NUMERIC(15,2) |  | YES | 0 |  |
| `inward_nil_rated` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_output_igst` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_output_cgst` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_output_sgst` | NUMERIC(15,2) |  | YES | 0 |  |
| `total_output_cess` | NUMERIC(15,2) |  | YES | 0 |  |
| `import_goods_igst` | NUMERIC(15,2) |  | YES | 0 |  |
| `import_service_igst` | NUMERIC(15,2) |  | YES | 0 |  |
| `inward_supplies_igst` | NUMERIC(15,2) |  | YES | 0 |  |
| `inward_supplies_cgst` | NUMERIC(15,2) |  | YES | 0 |  |
| `inward_supplies_sgst` | NUMERIC(15,2) |  | YES | 0 |  |
| `itc_reversal_igst` | NUMERIC(15,2) |  | YES | 0 |  |
| `itc_reversal_cgst` | NUMERIC(15,2) |  | YES | 0 |  |
| `itc_reversal_sgst` | NUMERIC(15,2) |  | YES | 0 |  |
| `inter_state_supplies` | NUMERIC(15,2) |  | YES | 0 |  |
| `intra_state_supplies` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_payable_igst` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_payable_cgst` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_payable_sgst` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_payable_cess` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_paid_cash_igst` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_paid_cash_cgst` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_paid_cash_sgst` | NUMERIC(15,2) |  | YES | 0 |  |
| `tax_paid_cash_cess` | NUMERIC(15,2) |  | YES | 0 |  |
| `interest_payable` | NUMERIC(15,2) |  | YES | 0 |  |
| `late_fee` | NUMERIC(15,2) |  | YES | 0 |  |
| `filing_status` | TEXT |  | YES | 'draft'::text |  |
| `filed_date` | DATE |  | YES |  |  |
| `arn_number` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |

### gst.hsn_sac_codes

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `hsn_sac_id` | INTEGER(32) | PK | NO | nextval('gst.hsn_sac_codes_... |  |
| `code` | TEXT |  | NO |  |  |
| `code_type` | TEXT |  | NO |  |  |
| `description` | TEXT |  | NO |  |  |
| `igst_rate` | NUMERIC(5,2) |  | NO |  |  |
| `cgst_rate` | NUMERIC(5,2) |  | NO |  |  |
| `sgst_rate` | NUMERIC(5,2) |  | NO |  |  |
| `cess_rate` | NUMERIC(5,2) |  | YES | 0 |  |
| `effective_from` | DATE |  | NO | '2017-07-01'::date |  |
| `effective_until` | DATE |  | YES |  |  |
| `chapter_code` | TEXT |  | YES |  |  |
| `chapter_name` | TEXT |  | YES |  |  |
| `section_name` | TEXT |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### gst.purchase_reconciliation

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `reconciliation_id` | INTEGER(32) | PK | NO | nextval('gst.purchase_recon... |  |
| `org_id` | INTEGER(32) |  | NO |  |  |
| `supplier_gstin` | TEXT |  | YES |  |  |
| `invoice_number` | TEXT |  | YES |  |  |
| `invoice_date` | DATE |  | YES |  |  |
| `invoice_value` | NUMERIC(15,2) |  | YES |  |  |
| `match_status` | TEXT |  | YES |  |  |
| `mismatch_reason` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### gst.return_filing_status

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `filing_id` | INTEGER(32) | PK | NO | nextval('gst.return_filing_... |  |
| `org_id` | INTEGER(32) |  | NO |  |  |
| `return_type` | TEXT |  | NO |  |  |
| `return_period` | TEXT |  | NO |  |  |
| `due_date` | DATE |  | NO |  |  |
| `filing_date` | DATE |  | YES |  |  |
| `filing_status` | TEXT |  | YES |  |  |
| `acknowledgment_number` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

## compliance

**Tables:** `compliance_alerts`, `compliance_audits`, `compliance_documents`, `compliance_violations`, `corrective_action_plans`, `corrective_actions`, `destruction_approvals`, `drug_licenses`, `environmental_breaches`, `environmental_compliance`, `expired_destructions`, `inspection_schedule`, `inspector_visits`, `license_renewal_history`, `license_types`, `narcotic_discrepancies`, `narcotic_register`, `org_compliance_status`, `org_licenses`, `pharmacist_registrations`, `product_recalls`, `quality_control_tests`, `quality_deviations`, `regulatory_authorities`, `regulatory_inspections`, `required_licenses`, `temperature_logs`, `temperature_zones`

### compliance.compliance_alerts

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `alert_id` | INTEGER(32) | PK | NO | nextval('compliance.complia... |  |
| `org_id` | UUID |  | NO |  |  |
| `alert_type` | TEXT |  | NO |  |  |
| `alert_date` | DATE |  | NO |  |  |
| `reference_type` | TEXT |  | NO |  |  |
| `reference_id` | INTEGER(32) |  | NO |  |  |
| `alert_message` | TEXT |  | NO |  |  |
| `priority` | TEXT |  | YES | 'medium'::text |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `is_resolved` | BOOLEAN |  | YES | false |  |
| `resolved_date` | DATE |  | YES |  |  |
| `resolved_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.compliance_audits

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `audit_id` | INTEGER(32) | PK | NO | nextval('compliance.complia... |  |
| `org_id` | UUID |  | NO |  |  |
| `audit_type` | TEXT |  | NO |  |  |
| `audit_date` | DATE |  | NO |  |  |
| `auditor_name` | TEXT |  | NO |  |  |
| `auditor_organization` | TEXT |  | YES |  |  |
| `areas_audited` | JSONB |  | NO |  |  |
| `audit_findings` | JSONB |  | YES |  |  |
| `overall_status` | TEXT |  | NO |  |  |
| `next_audit_date` | DATE |  | YES |  |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.compliance_documents

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `document_id` | INTEGER(32) | PK | NO | nextval('compliance.complia... |  |
| `org_id` | UUID |  | NO |  |  |
| `document_type` | TEXT |  | NO |  |  |
| `document_name` | TEXT |  | NO |  |  |
| `file_data` | TEXT |  | YES |  |  |
| `file_url` | TEXT |  | YES |  |  |
| `expiry_date` | DATE |  | YES |  |  |
| `reminder_days` | INTEGER(32) |  | YES | 30 |  |
| `tags` | JSONB |  | YES |  |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.compliance_violations

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `violation_id` | INTEGER(32) | PK | NO | nextval('compliance.complia... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `violation_date` | DATE |  | NO |  |  |
| `violation_type` | TEXT |  | NO |  |  |
| `violation_category` | TEXT |  | NO |  |  |
| `severity` | TEXT |  | NO |  |  |
| `violation_description` | TEXT |  | NO |  |  |
| `reference_type` | TEXT |  | YES |  |  |
| `reference_id` | INTEGER(32) |  | YES |  |  |
| `notice_received` | BOOLEAN |  | YES | false |  |
| `notice_date` | DATE |  | YES |  |  |
| `notice_number` | TEXT |  | YES |  |  |
| `response_required` | BOOLEAN |  | YES | true |  |
| `response_due_date` | DATE |  | YES |  |  |
| `response_submitted` | BOOLEAN |  | YES | false |  |
| `response_date` | DATE |  | YES |  |  |
| `penalty_imposed` | BOOLEAN |  | YES | false |  |
| `penalty_type` | TEXT |  | YES |  |  |
| `penalty_amount` | NUMERIC(15,2) |  | YES |  |  |
| `penalty_duration_days` | INTEGER(32) |  | YES |  |  |
| `corrective_action_plan` | TEXT |  | YES |  |  |
| `cap_submitted_date` | DATE |  | YES |  |  |
| `cap_approved` | BOOLEAN |  | YES | false |  |
| `violation_status` | TEXT |  | YES | 'open'::text |  |
| `resolved_date` | DATE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### compliance.corrective_action_plans

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `cap_id` | INTEGER(32) | PK | NO | nextval('compliance.correct... |  |
| `inspection_id` | INTEGER(32) | FK→regulatory_inspections | NO |  |  |
| `cap_number` | TEXT |  | NO |  |  |
| `submission_date` | DATE |  | NO |  |  |
| `total_observations` | INTEGER(32) |  | NO |  |  |
| `critical_observations` | INTEGER(32) |  | YES | 0 |  |
| `major_observations` | INTEGER(32) |  | YES | 0 |  |
| `minor_observations` | INTEGER(32) |  | YES | 0 |  |
| `action_items` | JSONB |  | YES | '[]'::jsonb |  |
| `cap_status` | TEXT |  | YES | 'draft'::text |  |
| `completion_percentage` | NUMERIC(5,2) |  | YES | 0 |  |
| `approved_by` | TEXT |  | YES |  |  |
| `approved_date` | DATE |  | YES |  |  |
| `verified_by` | TEXT |  | YES |  |  |
| `verified_date` | DATE |  | YES |  |  |
| `verification_notes` | TEXT |  | YES |  |  |
| `due_date` | DATE |  | NO |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### compliance.corrective_actions

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `action_id` | INTEGER(32) | PK | NO | nextval('compliance.correct... |  |
| `org_id` | UUID |  | NO |  |  |
| `audit_id` | INTEGER(32) | FK→compliance_audits | YES |  |  |
| `visit_id` | INTEGER(32) | FK→inspector_visits | YES |  |  |
| `area` | TEXT |  | NO |  |  |
| `issue_description` | TEXT |  | NO |  |  |
| `corrective_action` | TEXT |  | NO |  |  |
| `priority` | TEXT |  | NO |  |  |
| `due_date` | DATE |  | NO |  |  |
| `status` | TEXT |  | NO | 'pending'::text |  |
| `completed_date` | DATE |  | YES |  |  |
| `completed_by` | INTEGER(32) |  | YES |  |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.destruction_approvals

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `approval_id` | INTEGER(32) | PK | NO | nextval('compliance.destruc... |  |
| `reference_type` | TEXT |  | YES |  |  |
| `reference_id` | INTEGER(32) |  | YES |  |  |
| `approval_authority` | TEXT |  | YES |  |  |
| `approval_number` | TEXT |  | YES |  |  |
| `approval_date` | DATE |  | YES |  |  |
| `approval_status` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.drug_licenses

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `license_id` | INTEGER(32) | PK | NO | nextval('compliance.drug_li... |  |
| `org_id` | UUID |  | NO |  |  |
| `license_type` | TEXT |  | NO |  |  |
| `license_number` | TEXT |  | NO |  |  |
| `license_category` | JSONB |  | YES |  |  |
| `issuing_authority` | TEXT |  | NO |  |  |
| `issue_date` | DATE |  | NO |  |  |
| `expiry_date` | DATE |  | NO |  |  |
| `premises_address` | TEXT |  | NO |  |  |
| `pharmacist_name` | TEXT |  | NO |  |  |
| `pharmacist_registration` | TEXT |  | NO |  |  |
| `pharmacist_qualification` | TEXT |  | YES |  |  |
| `storage_capacity` | JSONB |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.environmental_breaches

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `breach_id` | INTEGER(32) | PK | NO | nextval('compliance.environ... |  |
| `env_compliance_id` | INTEGER(32) | FK→environmental_compliance | NO |  |  |
| `breach_date` | DATE |  | NO |  |  |
| `parameter_name` | TEXT |  | NO |  |  |
| `measured_value` | NUMERIC(15,4) |  | NO |  |  |
| `prescribed_limit` | NUMERIC(15,4) |  | NO |  |  |
| `deviation_percentage` | NUMERIC(10,2) |  | NO |  |  |
| `breach_level` | TEXT |  | NO |  |  |
| `authority_notified` | BOOLEAN |  | YES | false |  |
| `notification_date` | DATE |  | YES |  |  |
| `notification_reference` | TEXT |  | YES |  |  |
| `penalty_imposed` | BOOLEAN |  | YES | false |  |
| `penalty_amount` | NUMERIC(15,2) |  | YES |  |  |
| `penalty_paid` | BOOLEAN |  | YES | false |  |
| `penalty_payment_date` | DATE |  | YES |  |  |
| `corrective_measures` | TEXT |  | YES |  |  |
| `implementation_timeline` | TEXT |  | YES |  |  |
| `measures_completed` | BOOLEAN |  | YES | false |  |
| `completion_verified_date` | DATE |  | YES |  |  |
| `breach_status` | TEXT |  | YES | 'open'::text |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `reported_by` | INTEGER(32) | FK→org_users | NO |  |  |

### compliance.environmental_compliance

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `env_compliance_id` | INTEGER(32) | PK | NO | nextval('compliance.environ... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | YES |  |  |
| `monitoring_date` | DATE |  | NO |  |  |
| `compliance_type` | TEXT |  | NO |  |  |
| `parameter_name` | TEXT |  | NO |  |  |
| `parameter_unit` | TEXT |  | NO |  |  |
| `measured_value` | NUMERIC(15,4) |  | NO |  |  |
| `prescribed_limit` | NUMERIC(15,4) |  | NO |  |  |
| `within_limits` | BOOLEAN |  | YES |  |  |
| `deviation_percentage` | NUMERIC(10,2) |  | YES |  |  |
| `sampling_point` | TEXT |  | YES |  |  |
| `testing_method` | TEXT |  | YES |  |  |
| `tested_by` | TEXT |  | YES |  |  |
| `external_lab` | BOOLEAN |  | YES | false |  |
| `lab_name` | TEXT |  | YES |  |  |
| `compliance_status` | TEXT |  | YES |  |  |
| `corrective_action_required` | BOOLEAN |  | YES | false |  |
| `corrective_action_taken` | TEXT |  | YES |  |  |
| `action_completion_date` | DATE |  | YES |  |  |
| `reported_to_authority` | BOOLEAN |  | YES | false |  |
| `report_date` | DATE |  | YES |  |  |
| `report_reference` | TEXT |  | YES |  |  |
| `test_report_path` | TEXT |  | YES |  |  |
| `status` | TEXT |  | YES | 'active'::text |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### compliance.expired_destructions

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `destruction_id` | INTEGER(32) | PK | NO | nextval('compliance.expired... |  |
| `org_id` | UUID |  | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | YES |  |  |
| `batch_number` | TEXT |  | NO |  |  |
| `quantity_destroyed` | NUMERIC(15,3) |  | NO |  |  |
| `expiry_date` | DATE |  | NO |  |  |
| `destruction_date` | DATE |  | NO |  |  |
| `destruction_method` | TEXT |  | NO |  |  |
| `witness_names` | ARRAY |  | NO |  |  |
| `destruction_certificate` | TEXT |  | YES |  |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.inspection_schedule

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `schedule_id` | INTEGER(32) | PK | NO | nextval('compliance.inspect... |  |
| `org_id` | INTEGER(32) |  | NO |  |  |
| `inspection_type` | TEXT |  | YES |  |  |
| `regulatory_body` | TEXT |  | YES |  |  |
| `scheduled_date` | DATE |  | YES |  |  |
| `notification_sent` | BOOLEAN |  | YES | false |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.inspector_visits

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `visit_id` | INTEGER(32) | PK | NO | nextval('compliance.inspect... |  |
| `org_id` | UUID |  | NO |  |  |
| `visit_date` | DATE |  | NO |  |  |
| `inspector_name` | TEXT |  | NO |  |  |
| `inspector_id` | TEXT |  | YES |  |  |
| `inspector_designation` | TEXT |  | YES |  |  |
| `visit_type` | TEXT |  | NO |  |  |
| `areas_inspected` | JSONB |  | YES |  |  |
| `violations_found` | JSONB |  | YES |  |  |
| `recommendations` | JSONB |  | YES |  |  |
| `follow_up_required` | BOOLEAN |  | YES | false |  |
| `next_visit_date` | DATE |  | YES |  |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.license_renewal_history

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `renewal_id` | INTEGER(32) | PK | NO | nextval('compliance.license... |  |
| `license_id` | INTEGER(32) | FK→org_licenses | NO |  |  |
| `renewal_date` | DATE |  | NO |  |  |
| `old_expiry_date` | DATE |  | NO |  |  |
| `new_expiry_date` | DATE |  | NO |  |  |
| `application_number` | TEXT |  | YES |  |  |
| `application_date` | DATE |  | YES |  |  |
| `renewal_fee_paid` | NUMERIC(15,2) |  | YES |  |  |
| `late_fee_paid` | NUMERIC(15,2) |  | YES | 0 |  |
| `payment_reference` | TEXT |  | YES |  |  |
| `processed_by` | TEXT |  | YES |  |  |
| `processing_time_days` | INTEGER(32) |  | YES |  |  |
| `renewal_documents` | JSONB |  | YES | '[]'::jsonb |  |
| `renewal_status` | TEXT |  | YES | 'completed'::text |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### compliance.license_types

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `license_type_id` | INTEGER(32) | PK | NO | nextval('compliance.license... |  |
| `license_code` | TEXT |  | NO |  |  |
| `license_name` | TEXT |  | NO |  |  |
| `license_category` | TEXT |  | NO |  |  |
| `issuing_authority` | TEXT |  | NO |  |  |
| `authority_level` | TEXT |  | NO |  |  |
| `validity_years` | INTEGER(32) |  | YES |  |  |
| `renewal_before_expiry_days` | INTEGER(32) |  | YES | 90 |  |
| `eligibility_criteria` | JSONB |  | YES | '{}'::jsonb |  |
| `required_documents` | JSONB |  | YES | '[]'::jsonb |  |
| `application_fee` | NUMERIC(15,2) |  | YES |  |  |
| `renewal_fee` | NUMERIC(15,2) |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.narcotic_discrepancies

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `discrepancy_id` | INTEGER(32) | PK | NO | nextval('compliance.narcoti... |  |
| `register_id` | INTEGER(32) | FK→narcotic_register | NO |  |  |
| `identified_date` | DATE |  | NO |  |  |
| `expected_balance` | NUMERIC(15,3) |  | NO |  |  |
| `actual_balance` | NUMERIC(15,3) |  | NO |  |  |
| `discrepancy_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `discrepancy_type` | TEXT |  | NO |  |  |
| `investigation_status` | TEXT |  | YES | 'pending'::text |  |
| `investigation_findings` | TEXT |  | YES |  |  |
| `root_cause` | TEXT |  | YES |  |  |
| `reported_to_authority` | BOOLEAN |  | YES | false |  |
| `authority_report_date` | DATE |  | YES |  |  |
| `authority_report_number` | TEXT |  | YES |  |  |
| `resolution_status` | TEXT |  | YES | 'open'::text |  |
| `resolution_date` | DATE |  | YES |  |  |
| `resolution_notes` | TEXT |  | YES |  |  |
| `reported_date` | DATE |  | NO |  |  |
| `reported_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.narcotic_register

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `register_id` | INTEGER(32) | PK | NO | nextval('compliance.narcoti... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `transaction_date` | DATE |  | NO |  |  |
| `transaction_type` | TEXT |  | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `batch_id` | INTEGER(32) | FK→batches | YES |  |  |
| `batch_number` | TEXT |  | YES |  |  |
| `receipt_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `issue_quantity` | NUMERIC(15,3) |  | YES | 0 |  |
| `balance_quantity` | NUMERIC(15,3) |  | NO |  |  |
| `party_type` | TEXT |  | YES |  |  |
| `party_name` | TEXT |  | YES |  |  |
| `party_license_number` | TEXT |  | YES |  |  |
| `prescription_number` | TEXT |  | YES |  |  |
| `prescriber_name` | TEXT |  | YES |  |  |
| `prescriber_registration` | TEXT |  | YES |  |  |
| `patient_name` | TEXT |  | YES |  |  |
| `patient_id_proof` | TEXT |  | YES |  |  |
| `permit_number` | TEXT |  | YES |  |  |
| `permit_date` | DATE |  | YES |  |  |
| `verified_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `witness_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `reference_type` | TEXT |  | YES |  |  |
| `reference_number` | TEXT |  | YES |  |  |
| `remarks` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### compliance.org_compliance_status

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `status_id` | INTEGER(32) | PK | NO | nextval('compliance.org_com... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `overall_compliance_score` | NUMERIC(5,2) |  | YES | 100 |  |
| `compliance_grade` | TEXT |  | YES | 'A'::text |  |
| `risk_level` | TEXT |  | YES | 'low'::text |  |
| `total_licenses` | INTEGER(32) |  | YES | 0 |  |
| `active_licenses` | INTEGER(32) |  | YES | 0 |  |
| `expired_licenses` | INTEGER(32) |  | YES | 0 |  |
| `expiring_soon` | INTEGER(32) |  | YES | 0 |  |
| `last_inspection_date` | DATE |  | YES |  |  |
| `inspections_this_year` | INTEGER(32) |  | YES | 0 |  |
| `critical_observations_pending` | INTEGER(32) |  | YES | 0 |  |
| `qc_tests_this_month` | INTEGER(32) |  | YES | 0 |  |
| `qc_failure_rate` | NUMERIC(5,2) |  | YES | 0 |  |
| `open_deviations` | INTEGER(32) |  | YES | 0 |  |
| `environmental_breaches_ytd` | INTEGER(32) |  | YES | 0 |  |
| `pending_corrective_actions` | INTEGER(32) |  | YES | 0 |  |
| `open_violations` | INTEGER(32) |  | YES | 0 |  |
| `violations_this_year` | INTEGER(32) |  | YES | 0 |  |
| `last_calculated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.org_licenses

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `license_id` | INTEGER(32) | PK | NO | nextval('compliance.org_lic... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | YES |  |  |
| `license_type_id` | INTEGER(32) | FK→license_types | NO |  |  |
| `license_number` | TEXT |  | NO |  |  |
| `license_name` | TEXT |  | NO |  |  |
| `issue_date` | DATE |  | NO |  |  |
| `valid_from` | DATE |  | NO |  |  |
| `valid_until` | DATE |  | NO |  |  |
| `license_status` | TEXT |  | YES | 'active'::text |  |
| `expiry_status` | TEXT |  | YES | 'active'::text |  |
| `renewal_status` | TEXT |  | YES | 'not_due'::text |  |
| `renewal_application_date` | DATE |  | YES |  |  |
| `renewal_application_number` | TEXT |  | YES |  |  |
| `next_renewal_date` | DATE |  | YES |  |  |
| `license_document_path` | TEXT |  | YES |  |  |
| `supporting_documents` | JSONB |  | YES | '[]'::jsonb |  |
| `last_inspection_date` | DATE |  | YES |  |  |
| `next_inspection_due` | DATE |  | YES |  |  |
| `compliance_score` | NUMERIC(5,2) |  | YES |  |  |
| `suspended` | BOOLEAN |  | YES | false |  |
| `suspension_date` | DATE |  | YES |  |  |
| `suspension_reason` | TEXT |  | YES |  |  |
| `suspension_lifted_date` | DATE |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### compliance.pharmacist_registrations

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `registration_id` | INTEGER(32) | PK | NO | nextval('compliance.pharmac... |  |
| `org_id` | UUID |  | NO |  |  |
| `pharmacist_name` | TEXT |  | NO |  |  |
| `registration_number` | TEXT |  | NO |  |  |
| `qualification` | TEXT |  | NO |  |  |
| `registration_state` | TEXT |  | NO |  |  |
| `registration_date` | DATE |  | NO |  |  |
| `expiry_date` | DATE |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.product_recalls

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `recall_id` | INTEGER(32) | PK | NO | nextval('compliance.product... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `recall_number` | TEXT |  | NO |  |  |
| `recall_date` | DATE |  | NO | CURRENT_DATE |  |
| `recall_type` | TEXT |  | NO |  |  |
| `recall_classification` | TEXT |  | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `affected_batches` | ARRAY |  | YES |  |  |
| `batch_numbers` | ARRAY |  | YES |  |  |
| `reason_category` | TEXT |  | NO |  |  |
| `reason_description` | TEXT |  | NO |  |  |
| `health_hazard_assessment` | TEXT |  | YES |  |  |
| `distribution_pattern` | TEXT |  | NO |  |  |
| `states_affected` | ARRAY |  | YES |  |  |
| `countries_affected` | ARRAY |  | YES |  |  |
| `quantity_distributed` | NUMERIC(15,3) |  | YES |  |  |
| `quantity_recovered` | NUMERIC(15,3) |  | YES |  |  |
| `customers_notified` | INTEGER(32) |  | YES | 0 |  |
| `notification_method` | ARRAY |  | YES |  |  |
| `notification_date` | DATE |  | YES |  |  |
| `fda_notified` | BOOLEAN |  | YES | false |  |
| `fda_notification_date` | DATE |  | YES |  |  |
| `regulatory_references` | ARRAY |  | YES |  |  |
| `recall_status` | TEXT |  | YES | 'initiated'::text |  |
| `effectiveness_checks_required` | INTEGER(32) |  | YES | 2 |  |
| `effectiveness_checks_completed` | INTEGER(32) |  | YES | 0 |  |
| `estimated_cost` | NUMERIC(15,2) |  | YES |  |  |
| `actual_cost` | NUMERIC(15,2) |  | YES |  |  |
| `insurance_claim_filed` | BOOLEAN |  | YES | false |  |
| `completion_date` | DATE |  | YES |  |  |
| `final_report_submitted` | BOOLEAN |  | YES | false |  |
| `lessons_learned` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### compliance.quality_control_tests

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `qc_test_id` | INTEGER(32) | PK | NO | nextval('compliance.quality... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `test_number` | TEXT |  | NO |  |  |
| `test_date` | DATE |  | NO |  |  |
| `test_type` | TEXT |  | NO |  |  |
| `reference_type` | TEXT |  | NO |  |  |
| `reference_id` | INTEGER(32) |  | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | NO |  |  |
| `batch_id` | INTEGER(32) | FK→batches | YES |  |  |
| `batch_number` | TEXT |  | YES |  |  |
| `sample_quantity` | NUMERIC(15,3) |  | YES |  |  |
| `sample_unit` | TEXT |  | YES |  |  |
| `sampling_method` | TEXT |  | YES |  |  |
| `sampled_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `test_parameters` | JSONB |  | YES | '[]'::jsonb |  |
| `test_status` | TEXT |  | YES | 'pending'::text |  |
| `tested_by` | TEXT |  | YES |  |  |
| `testing_lab` | TEXT |  | YES | 'in_house'::text |  |
| `external_lab_name` | TEXT |  | YES |  |  |
| `completed_date` | DATE |  | YES |  |  |
| `test_report_number` | TEXT |  | YES |  |  |
| `test_report_path` | TEXT |  | YES |  |  |
| `is_retest` | BOOLEAN |  | YES | false |  |
| `original_test_id` | INTEGER(32) | FK→quality_control_tests | YES |  |  |
| `retest_reason` | TEXT |  | YES |  |  |
| `approved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `approved_date` | DATE |  | YES |  |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.quality_deviations

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `deviation_id` | INTEGER(32) | PK | NO | nextval('compliance.quality... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `deviation_number` | TEXT |  | NO |  |  |
| `deviation_date` | DATE |  | NO |  |  |
| `deviation_type` | TEXT |  | NO |  |  |
| `deviation_category` | TEXT |  | NO |  |  |
| `severity` | TEXT |  | NO |  |  |
| `deviation_description` | TEXT |  | NO |  |  |
| `root_cause` | TEXT |  | YES |  |  |
| `impact_assessment` | TEXT |  | YES |  |  |
| `batches_affected` | ARRAY |  | YES |  |  |
| `products_affected` | ARRAY |  | YES |  |  |
| `reference_type` | TEXT |  | YES |  |  |
| `reference_id` | INTEGER(32) |  | YES |  |  |
| `investigation_required` | BOOLEAN |  | YES | true |  |
| `investigation_status` | TEXT |  | YES | 'pending'::text |  |
| `investigation_completed_date` | DATE |  | YES |  |  |
| `investigation_findings` | TEXT |  | YES |  |  |
| `capa_required` | BOOLEAN |  | YES | true |  |
| `capa_number` | TEXT |  | YES |  |  |
| `capa_status` | TEXT |  | YES |  |  |
| `reported_by` | INTEGER(32) | FK→org_users | NO |  |  |
| `qa_reviewed_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `qa_reviewed_date` | DATE |  | YES |  |  |
| `deviation_status` | TEXT |  | YES | 'open'::text |  |
| `closed_date` | DATE |  | YES |  |  |
| `closed_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.regulatory_authorities

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `authority_id` | INTEGER(32) | PK | NO | nextval('compliance.regulat... |  |
| `authority_code` | TEXT |  | NO |  |  |
| `authority_name` | TEXT |  | NO |  |  |
| `authority_type` | TEXT |  | NO |  |  |
| `jurisdiction_level` | TEXT |  | NO |  |  |
| `state` | TEXT |  | YES |  |  |
| `district` | TEXT |  | YES |  |  |
| `contact_info` | JSONB |  | YES | '{}'::jsonb |  |
| `routine_inspection_frequency_days` | INTEGER(32) |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.regulatory_inspections

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `inspection_id` | INTEGER(32) | PK | NO | nextval('compliance.regulat... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | YES |  |  |
| `inspection_date` | DATE |  | NO |  |  |
| `inspection_type` | TEXT |  | NO |  |  |
| `authority_id` | INTEGER(32) | FK→regulatory_authorities | NO |  |  |
| `license_id` | INTEGER(32) | FK→org_licenses | YES |  |  |
| `inspectors` | JSONB |  | YES | '[]'::jsonb |  |
| `inspection_scope` | TEXT |  | NO |  |  |
| `areas_inspected` | ARRAY |  | YES |  |  |
| `total_observations` | INTEGER(32) |  | YES | 0 |  |
| `critical_observations` | INTEGER(32) |  | YES | 0 |  |
| `major_observations` | INTEGER(32) |  | YES | 0 |  |
| `minor_observations` | INTEGER(32) |  | YES | 0 |  |
| `inspection_findings` | JSONB |  | YES | '[]'::jsonb |  |
| `overall_result` | TEXT |  | YES |  |  |
| `follow_up_required` | BOOLEAN |  | YES | false |  |
| `follow_up_date` | DATE |  | YES |  |  |
| `follow_up_completed` | BOOLEAN |  | YES | false |  |
| `inspection_report_date` | DATE |  | YES |  |  |
| `inspection_report_path` | TEXT |  | YES |  |  |
| `inspection_status` | TEXT |  | YES | 'scheduled'::text |  |
| `notes` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### compliance.required_licenses

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `requirement_id` | INTEGER(32) | PK | NO | nextval('compliance.require... |  |
| `license_type` | TEXT |  | NO |  |  |
| `license_category` | TEXT |  | YES |  |  |
| `regulatory_body` | TEXT |  | YES |  |  |
| `applicable_to` | ARRAY |  | YES |  |  |
| `is_mandatory` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.temperature_logs

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `log_id` | INTEGER(32) | PK | NO | nextval('compliance.tempera... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | NO |  |  |
| `location_id` | INTEGER(32) | FK→storage_locations | NO |  |  |
| `device_id` | TEXT |  | NO |  |  |
| `device_type` | TEXT |  | NO |  |  |
| `temperature` | NUMERIC(5,2) |  | NO |  |  |
| `humidity` | NUMERIC(5,2) |  | YES |  |  |
| `recorded_at` | TIMESTAMP WITH TIME ZONE |  | NO | CURRENT_TIMESTAMP |  |
| `within_range` | BOOLEAN |  | NO |  |  |
| `min_allowed` | NUMERIC(5,2) |  | NO |  |  |
| `max_allowed` | NUMERIC(5,2) |  | NO |  |  |
| `is_excursion` | BOOLEAN |  | YES | false |  |
| `excursion_duration_minutes` | INTEGER(32) |  | YES |  |  |
| `excursion_severity` | TEXT |  | YES |  |  |
| `action_required` | BOOLEAN |  | YES | false |  |
| `action_taken` | TEXT |  | YES |  |  |
| `action_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `action_timestamp` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `affected_products` | ARRAY |  | YES |  |  |
| `affected_batches` | ARRAY |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### compliance.temperature_zones

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `zone_id` | INTEGER(32) | PK | NO | nextval('compliance.tempera... |  |
| `org_id` | UUID |  | NO |  |  |
| `zone_name` | TEXT |  | NO |  |  |
| `zone_type` | TEXT |  | NO |  |  |
| `min_temperature` | NUMERIC(5,2) |  | YES |  |  |
| `max_temperature` | NUMERIC(5,2) |  | YES |  |  |
| `last_reading` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

## analytics

**Tables:** `alert_definitions`, `alert_history`, `dashboard_cache`, `dashboard_widgets`, `dashboards`, `data_quality_metrics`, `kpi_definitions`, `kpi_values`, `product_consumption_stats`, `report_execution_history`, `report_schedules`, `report_templates`, `user_activity_analytics`

### analytics.alert_definitions

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `alert_id` | INTEGER(32) | PK | NO | nextval('analytics.alert_de... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `alert_code` | TEXT |  | NO |  |  |
| `alert_name` | TEXT |  | NO |  |  |
| `alert_category` | TEXT |  | NO |  |  |
| `trigger_type` | TEXT |  | NO |  |  |
| `check_query` | TEXT |  | NO |  |  |
| `check_frequency_minutes` | INTEGER(32) |  | YES | 60 |  |
| `conditions` | JSONB |  | NO |  |  |
| `severity` | TEXT |  | NO |  |  |
| `notification_channels` | ARRAY |  | YES | '{email,dashboard}'::text[] |  |
| `recipients` | JSONB |  | YES | '{}'::jsonb |  |
| `message_template` | TEXT |  | YES |  |  |
| `cooldown_minutes` | INTEGER(32) |  | YES | 60 |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### analytics.alert_history

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `history_id` | INTEGER(32) | PK | NO | nextval('analytics.alert_hi... |  |
| `alert_id` | INTEGER(32) | FK→alert_definitions | NO |  |  |
| `triggered_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `trigger_value` | TEXT |  | YES |  |  |
| `trigger_details` | JSONB |  | YES | '{}'::jsonb |  |
| `severity` | TEXT |  | NO |  |  |
| `message` | TEXT |  | NO |  |  |
| `notifications_sent` | JSONB |  | YES | '{}'::jsonb |  |
| `acknowledged` | BOOLEAN |  | YES | false |  |
| `acknowledged_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `acknowledged_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `acknowledgment_notes` | TEXT |  | YES |  |  |
| `resolved` | BOOLEAN |  | YES | false |  |
| `resolved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `resolved_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `resolution_notes` | TEXT |  | YES |  |  |
| `alert_status` | TEXT |  | YES | 'open'::text |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### analytics.dashboard_cache

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `cache_id` | INTEGER(32) | PK | NO | nextval('analytics.dashboar... |  |
| `org_id` | UUID |  | YES |  |  |
| `metric_type` | CHARACTER VARYING(50) |  | YES |  |  |
| `metric_name` | CHARACTER VARYING(100) |  | YES |  |  |
| `metric_value` | NUMERIC |  | YES | 0 |  |
| `metric_date` | DATE |  | YES |  |  |
| `last_updated` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### analytics.dashboard_widgets

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `widget_id` | INTEGER(32) | PK | NO | nextval('analytics.dashboar... |  |
| `dashboard_id` | INTEGER(32) | FK→dashboards | NO |  |  |
| `widget_type` | TEXT |  | NO |  |  |
| `widget_title` | TEXT |  | NO |  |  |
| `data_query` | TEXT |  | NO |  |  |
| `refresh_interval_seconds` | INTEGER(32) |  | YES |  |  |
| `chart_type` | TEXT |  | YES |  |  |
| `chart_config` | JSONB |  | YES | '{}'::jsonb |  |
| `position_x` | INTEGER(32) |  | NO |  |  |
| `position_y` | INTEGER(32) |  | NO |  |  |
| `width` | INTEGER(32) |  | NO | 4 |  |
| `height` | INTEGER(32) |  | NO | 4 |  |
| `is_interactive` | BOOLEAN |  | YES | true |  |
| `drill_down_enabled` | BOOLEAN |  | YES | false |  |
| `drill_down_dashboard_id` | INTEGER(32) | FK→dashboards | YES |  |  |
| `thresholds` | JSONB |  | YES | '[]'::jsonb |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### analytics.dashboards

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `dashboard_id` | INTEGER(32) | PK | NO | nextval('analytics.dashboar... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `dashboard_code` | TEXT |  | NO |  |  |
| `dashboard_name` | TEXT |  | NO |  |  |
| `dashboard_category` | TEXT |  | NO |  |  |
| `description` | TEXT |  | YES |  |  |
| `layout_type` | TEXT |  | YES | 'grid'::text |  |
| `layout_config` | JSONB |  | YES | '{}'::jsonb |  |
| `auto_refresh` | BOOLEAN |  | YES | false |  |
| `refresh_interval_seconds` | INTEGER(32) |  | YES | 300 |  |
| `is_public` | BOOLEAN |  | YES | false |  |
| `allowed_roles` | ARRAY |  | YES |  |  |
| `default_filters` | JSONB |  | YES | '{}'::jsonb |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### analytics.data_quality_metrics

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `metric_id` | INTEGER(32) | PK | NO | nextval('analytics.data_qua... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `check_date` | DATE |  | NO | CURRENT_DATE |  |
| `table_schema` | TEXT |  | NO |  |  |
| `table_name` | TEXT |  | NO |  |  |
| `total_records` | INTEGER(32) |  | NO |  |  |
| `null_count` | INTEGER(32) |  | YES | 0 |  |
| `duplicate_count` | INTEGER(32) |  | YES | 0 |  |
| `field_checks` | JSONB |  | YES | '[]'::jsonb |  |
| `completeness_score` | NUMERIC(5,2) |  | YES |  |  |
| `validity_score` | NUMERIC(5,2) |  | YES |  |  |
| `consistency_score` | NUMERIC(5,2) |  | YES |  |  |
| `overall_quality_score` | NUMERIC(5,2) |  | YES |  |  |
| `critical_issues` | INTEGER(32) |  | YES | 0 |  |
| `major_issues` | INTEGER(32) |  | YES | 0 |  |
| `minor_issues` | INTEGER(32) |  | YES | 0 |  |
| `check_status` | TEXT |  | YES | 'completed'::text |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `checked_by` | INTEGER(32) | FK→org_users | YES |  |  |

### analytics.kpi_definitions

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `kpi_id` | INTEGER(32) | PK | NO | nextval('analytics.kpi_defi... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `kpi_code` | TEXT |  | NO |  |  |
| `kpi_name` | TEXT |  | NO |  |  |
| `kpi_category` | TEXT |  | NO |  |  |
| `calculation_query` | TEXT |  | NO |  |  |
| `aggregation_type` | TEXT |  | NO |  |  |
| `unit_of_measure` | TEXT |  | YES |  |  |
| `display_format` | TEXT |  | YES |  |  |
| `decimal_places` | INTEGER(32) |  | YES | 2 |  |
| `target_type` | TEXT |  | YES |  |  |
| `target_value` | NUMERIC(15,4) |  | YES |  |  |
| `target_query` | TEXT |  | YES |  |  |
| `calculation_frequency` | TEXT |  | NO |  |  |
| `track_trend` | BOOLEAN |  | YES | true |  |
| `trend_period_days` | INTEGER(32) |  | YES | 30 |  |
| `alert_enabled` | BOOLEAN |  | YES | false |  |
| `alert_threshold_type` | TEXT |  | YES |  |  |
| `alert_threshold_value` | NUMERIC(15,4) |  | YES |  |  |
| `alert_recipients` | ARRAY |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### analytics.kpi_values

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `value_id` | INTEGER(32) | PK | NO | nextval('analytics.kpi_valu... |  |
| `kpi_id` | INTEGER(32) | FK→kpi_definitions | NO |  |  |
| `calculation_date` | DATE |  | NO |  |  |
| `period_type` | TEXT |  | NO |  |  |
| `actual_value` | NUMERIC(15,4) |  | NO |  |  |
| `target_value` | NUMERIC(15,4) |  | YES |  |  |
| `previous_value` | NUMERIC(15,4) |  | YES |  |  |
| `variance_amount` | NUMERIC(15,4) |  | YES |  |  |
| `variance_percentage` | NUMERIC(10,2) |  | YES |  |  |
| `achievement_percentage` | NUMERIC(10,2) |  | YES |  |  |
| `trend_direction` | TEXT |  | YES |  |  |
| `trend_percentage` | NUMERIC(10,2) |  | YES |  |  |
| `status` | TEXT |  | YES |  |  |
| `calculation_time` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `calculation_duration_ms` | INTEGER(32) |  | YES |  |  |
| `data_quality_score` | NUMERIC(5,2) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### analytics.product_consumption_stats

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `stat_id` | INTEGER(32) | PK | NO | nextval('analytics.product_... |  |
| `org_id` | INTEGER(32) |  | NO |  |  |
| `product_id` | INTEGER(32) | FK→products | YES |  |  |
| `branch_id` | INTEGER(32) |  | YES |  |  |
| `calculation_date` | DATE |  | NO |  |  |
| `daily_consumption` | NUMERIC(12,3) |  | YES |  |  |
| `weekly_consumption` | NUMERIC(12,3) |  | YES |  |  |
| `monthly_consumption` | NUMERIC(12,3) |  | YES |  |  |
| `trend_direction` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### analytics.report_execution_history

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `execution_id` | INTEGER(32) | PK | NO | nextval('analytics.report_e... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `template_id` | INTEGER(32) | FK→report_templates | NO |  |  |
| `schedule_id` | INTEGER(32) | FK→report_schedules | YES |  |  |
| `execution_date` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `executed_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `execution_type` | TEXT |  | NO |  |  |
| `parameters_used` | JSONB |  | YES | '{}'::jsonb |  |
| `start_time` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `end_time` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `execution_time_ms` | INTEGER(32) |  | YES |  |  |
| `rows_processed` | INTEGER(32) |  | YES |  |  |
| `output_format` | TEXT |  | YES |  |  |
| `file_size_bytes` | INTEGER(32) |  | YES |  |  |
| `file_path` | TEXT |  | YES |  |  |
| `execution_status` | TEXT |  | YES | 'pending'::text |  |
| `error_message` | TEXT |  | YES |  |  |
| `emailed_to` | ARRAY |  | YES |  |  |
| `email_sent_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### analytics.report_schedules

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `schedule_id` | INTEGER(32) | PK | NO | nextval('analytics.report_s... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `template_id` | INTEGER(32) | FK→report_templates | NO |  |  |
| `schedule_name` | TEXT |  | NO |  |  |
| `frequency` | TEXT |  | NO |  |  |
| `run_time` | TIME WITHOUT TIME ZONE |  | YES | '08:00:00'::time without ti... |  |
| `run_day_of_week` | INTEGER(32) |  | YES |  |  |
| `run_day_of_month` | INTEGER(32) |  | YES |  |  |
| `report_parameters` | JSONB |  | YES | '{}'::jsonb |  |
| `email_recipients` | ARRAY |  | YES |  |  |
| `cc_recipients` | ARRAY |  | YES |  |  |
| `output_format` | TEXT |  | NO | 'pdf'::text |  |
| `next_run_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `last_run_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### analytics.report_templates

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `template_id` | INTEGER(32) | PK | NO | nextval('analytics.report_t... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `template_code` | TEXT |  | NO |  |  |
| `template_name` | TEXT |  | NO |  |  |
| `report_category` | TEXT |  | NO |  |  |
| `report_type` | TEXT |  | NO |  |  |
| `query_template` | TEXT |  | NO |  |  |
| `parameters` | JSONB |  | YES | '[]'::jsonb |  |
| `output_formats` | ARRAY |  | YES | '{pdf,excel,csv}'::text[] |  |
| `default_format` | TEXT |  | YES | 'pdf'::text |  |
| `layout_config` | JSONB |  | YES | '{}'::jsonb |  |
| `schedulable` | BOOLEAN |  | YES | true |  |
| `required_roles` | ARRAY |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### analytics.user_activity_analytics

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `analytics_id` | INTEGER(32) | PK | NO | nextval('analytics.user_act... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `user_id` | INTEGER(32) | FK→org_users | NO |  |  |
| `activity_date` | DATE |  | NO |  |  |
| `login_count` | INTEGER(32) |  | YES | 0 |  |
| `first_login_time` | TIME WITHOUT TIME ZONE |  | YES |  |  |
| `last_login_time` | TIME WITHOUT TIME ZONE |  | YES |  |  |
| `total_session_duration_minutes` | INTEGER(32) |  | YES | 0 |  |
| `features_used` | ARRAY |  | YES |  |  |
| `most_used_feature` | TEXT |  | YES |  |  |
| `transactions_created` | INTEGER(32) |  | YES | 0 |  |
| `transactions_value` | NUMERIC(15,2) |  | YES | 0 |  |
| `module_activity` | JSONB |  | YES | '{}'::jsonb |  |
| `average_page_load_time_ms` | INTEGER(32) |  | YES |  |  |
| `slow_queries_count` | INTEGER(32) |  | YES | 0 |  |
| `errors_encountered` | INTEGER(32) |  | YES | 0 |  |
| `devices_used` | JSONB |  | YES | '[]'::jsonb |  |
| `locations` | JSONB |  | YES | '[]'::jsonb |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

## system_config

**Tables:** `api_logs`, `api_usage_log`, `api_usage_log_2024_01`, `api_usage_log_2024_02`, `audit_logs`, `backup_history`, `configuration_history`, `email_templates`, `error_logs`, `feature_flags`, `integration_logs`, `job_execution_history`, `scheduled_jobs`, `scheduled_notifications`, `setting_definitions`, `system_health_metrics`, `system_integrations`, `system_notifications`, `system_settings`, `user_notifications`, `workflow_definitions`, `workflow_instances`

### system_config.api_logs

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `log_id` | INTEGER(32) | PK | NO | nextval('system_config.api_... |  |
| `request_id` | UUID |  | YES | gen_random_uuid() |  |
| `user_id` | INTEGER(32) |  | YES |  |  |
| `endpoint` | TEXT |  | YES |  |  |
| `method` | TEXT |  | YES |  |  |
| `status` | TEXT |  | YES |  |  |
| `started_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES |  |  |
| `completed_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES |  |  |
| `response_code` | INTEGER(32) |  | YES |  |  |
| `error_message` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### system_config.api_usage_log

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `log_id` | BIGINT(64) | PK | NO | nextval('system_config.api_... |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `endpoint` | TEXT |  | NO |  |  |
| `method` | TEXT |  | NO |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `ip_address` | INET |  | YES |  |  |
| `user_agent` | TEXT |  | YES |  |  |
| `request_timestamp` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `response_time_ms` | INTEGER(32) |  | YES |  |  |
| `status_code` | INTEGER(32) |  | YES |  |  |
| `request_size_bytes` | INTEGER(32) |  | YES |  |  |
| `response_size_bytes` | INTEGER(32) |  | YES |  |  |
| `error_occurred` | BOOLEAN |  | YES | false |  |
| `error_message` | TEXT |  | YES |  |  |
| `rate_limit_remaining` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE | PK | NO | CURRENT_TIMESTAMP |  |

### system_config.api_usage_log_2024_01

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `log_id` | BIGINT(64) | PK | NO | nextval('system_config.api_... |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `endpoint` | TEXT |  | NO |  |  |
| `method` | TEXT |  | NO |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `ip_address` | INET |  | YES |  |  |
| `user_agent` | TEXT |  | YES |  |  |
| `request_timestamp` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `response_time_ms` | INTEGER(32) |  | YES |  |  |
| `status_code` | INTEGER(32) |  | YES |  |  |
| `request_size_bytes` | INTEGER(32) |  | YES |  |  |
| `response_size_bytes` | INTEGER(32) |  | YES |  |  |
| `error_occurred` | BOOLEAN |  | YES | false |  |
| `error_message` | TEXT |  | YES |  |  |
| `rate_limit_remaining` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE | PK | NO | CURRENT_TIMESTAMP |  |

### system_config.api_usage_log_2024_02

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `log_id` | BIGINT(64) | PK | NO | nextval('system_config.api_... |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `endpoint` | TEXT |  | NO |  |  |
| `method` | TEXT |  | NO |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `ip_address` | INET |  | YES |  |  |
| `user_agent` | TEXT |  | YES |  |  |
| `request_timestamp` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `response_time_ms` | INTEGER(32) |  | YES |  |  |
| `status_code` | INTEGER(32) |  | YES |  |  |
| `request_size_bytes` | INTEGER(32) |  | YES |  |  |
| `response_size_bytes` | INTEGER(32) |  | YES |  |  |
| `error_occurred` | BOOLEAN |  | YES | false |  |
| `error_message` | TEXT |  | YES |  |  |
| `rate_limit_remaining` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE | PK | NO | CURRENT_TIMESTAMP |  |

### system_config.audit_logs

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `audit_id` | BIGINT(64) | PK | NO | nextval('system_config.audi... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `activity_timestamp` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `activity_type` | TEXT |  | NO |  |  |
| `entity_type` | TEXT |  | NO |  |  |
| `entity_id` | TEXT |  | YES |  |  |
| `entity_name` | TEXT |  | YES |  |  |
| `action_performed` | TEXT |  | NO |  |  |
| `old_values` | JSONB |  | YES |  |  |
| `new_values` | JSONB |  | YES |  |  |
| `changed_fields` | ARRAY |  | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | NO |  |  |
| `user_name` | TEXT |  | NO |  |  |
| `session_id` | TEXT |  | YES |  |  |
| `ip_address` | INET |  | YES |  |  |
| `user_agent` | TEXT |  | YES |  |  |
| `request_method` | TEXT |  | YES |  |  |
| `request_url` | TEXT |  | YES |  |  |
| `module_name` | TEXT |  | YES |  |  |
| `function_name` | TEXT |  | YES |  |  |
| `result_status` | TEXT |  | YES | 'success'::text |  |
| `error_message` | TEXT |  | YES |  |  |
| `execution_time_ms` | INTEGER(32) |  | YES |  |  |
| `previous_audit_hash` | TEXT |  | YES |  |  |
| `current_audit_hash` | TEXT |  | YES |  |  |

### system_config.backup_history

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `backup_id` | INTEGER(32) | PK | NO | nextval('system_config.back... |  |
| `backup_name` | TEXT |  | NO |  |  |
| `backup_type` | TEXT |  | NO |  |  |
| `backup_path` | TEXT |  | YES |  |  |
| `backup_size` | BIGINT(64) |  | YES |  |  |
| `backup_status` | TEXT |  | YES |  |  |
| `metadata` | JSONB |  | YES |  |  |
| `created_by` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `completed_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES |  |  |
| `last_verified` | TIMESTAMP WITHOUT TIME ZONE |  | YES |  |  |
| `is_valid` | BOOLEAN |  | YES | true |  |

### system_config.configuration_history

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `history_id` | INTEGER(32) | PK | NO | nextval('system_config.conf... |  |
| `org_id` | INTEGER(32) |  | NO |  |  |
| `setting_key` | TEXT |  | NO |  |  |
| `old_value` | JSONB |  | YES |  |  |
| `new_value` | JSONB |  | YES |  |  |
| `changed_by` | INTEGER(32) |  | YES |  |  |
| `changed_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `change_reason` | TEXT |  | YES |  |  |

### system_config.email_templates

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `template_id` | INTEGER(32) | PK | NO | nextval('system_config.emai... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `template_code` | TEXT |  | NO |  |  |
| `template_name` | TEXT |  | NO |  |  |
| `template_category` | TEXT |  | NO |  |  |
| `subject_template` | TEXT |  | NO |  |  |
| `body_template_html` | TEXT |  | NO |  |  |
| `body_template_text` | TEXT |  | YES |  |  |
| `available_variables` | JSONB |  | YES | '[]'::jsonb |  |
| `from_name` | TEXT |  | YES |  |  |
| `from_email` | TEXT |  | YES |  |  |
| `reply_to_email` | TEXT |  | YES |  |  |
| `default_attachments` | JSONB |  | YES | '[]'::jsonb |  |
| `language` | TEXT |  | YES | 'en'::text |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### system_config.error_logs

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `error_id` | BIGINT(64) | PK | NO | nextval('system_config.erro... |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `error_timestamp` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `error_level` | TEXT |  | NO |  |  |
| `error_code` | TEXT |  | YES |  |  |
| `error_message` | TEXT |  | NO |  |  |
| `module_name` | TEXT |  | YES |  |  |
| `function_name` | TEXT |  | YES |  |  |
| `line_number` | INTEGER(32) |  | YES |  |  |
| `stack_trace` | TEXT |  | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `session_id` | TEXT |  | YES |  |  |
| `request_id` | TEXT |  | YES |  |  |
| `request_url` | TEXT |  | YES |  |  |
| `request_method` | TEXT |  | YES |  |  |
| `request_params` | JSONB |  | YES |  |  |
| `environment` | TEXT |  | YES |  |  |
| `server_name` | TEXT |  | YES |  |  |
| `error_data` | JSONB |  | YES | '{}'::jsonb |  |
| `is_resolved` | BOOLEAN |  | YES | false |  |
| `resolved_by` | INTEGER(32) | FK→org_users | YES |  |  |
| `resolved_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `resolution_notes` | TEXT |  | YES |  |  |

### system_config.feature_flags

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `flag_id` | INTEGER(32) | PK | NO | nextval('system_config.feat... |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `flag_key` | TEXT |  | NO |  |  |
| `flag_name` | TEXT |  | NO |  |  |
| `description` | TEXT |  | YES |  |  |
| `flag_type` | TEXT |  | NO |  |  |
| `default_value` | TEXT |  | NO |  |  |
| `targeting_rules` | JSONB |  | YES | '[]'::jsonb |  |
| `rollout_percentage` | INTEGER(32) |  | YES | 100 |  |
| `rollout_strategy` | TEXT |  | YES | 'all'::text |  |
| `variants` | JSONB |  | YES | '[]'::jsonb |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `expires_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |

### system_config.integration_logs

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `log_id` | BIGINT(64) | PK | NO | nextval('system_config.inte... |  |
| `integration_id` | INTEGER(32) | FK→system_integrations | NO |  |  |
| `request_timestamp` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `endpoint_name` | TEXT |  | YES |  |  |
| `request_method` | TEXT |  | YES |  |  |
| `request_url` | TEXT |  | YES |  |  |
| `request_headers` | JSONB |  | YES |  |  |
| `request_body` | JSONB |  | YES |  |  |
| `response_timestamp` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `response_status_code` | INTEGER(32) |  | YES |  |  |
| `response_headers` | JSONB |  | YES |  |  |
| `response_body` | JSONB |  | YES |  |  |
| `response_time_ms` | INTEGER(32) |  | YES |  |  |
| `status` | TEXT |  | NO |  |  |
| `error_message` | TEXT |  | YES |  |  |
| `reference_type` | TEXT |  | YES |  |  |
| `reference_id` | TEXT |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### system_config.job_execution_history

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `execution_id` | INTEGER(32) | PK | NO | nextval('system_config.job_... |  |
| `job_id` | INTEGER(32) | FK→scheduled_jobs | NO |  |  |
| `start_time` | TIMESTAMP WITH TIME ZONE |  | NO |  |  |
| `end_time` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `duration_seconds` | INTEGER(32) |  | YES |  |  |
| `execution_status` | TEXT |  | NO |  |  |
| `records_processed` | INTEGER(32) |  | YES |  |  |
| `records_succeeded` | INTEGER(32) |  | YES |  |  |
| `records_failed` | INTEGER(32) |  | YES |  |  |
| `output_log` | TEXT |  | YES |  |  |
| `error_log` | TEXT |  | YES |  |  |
| `cpu_usage_percent` | NUMERIC(5,2) |  | YES |  |  |
| `memory_usage_mb` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### system_config.scheduled_jobs

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `job_id` | INTEGER(32) | PK | NO | nextval('system_config.sche... |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `job_name` | TEXT |  | NO |  |  |
| `job_type` | TEXT |  | NO |  |  |
| `job_category` | TEXT |  | NO |  |  |
| `schedule_type` | TEXT |  | NO |  |  |
| `cron_expression` | TEXT |  | YES |  |  |
| `next_run_time` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `job_function` | TEXT |  | NO |  |  |
| `job_parameters` | JSONB |  | YES | '{}'::jsonb |  |
| `max_retries` | INTEGER(32) |  | YES | 3 |  |
| `retry_interval_minutes` | INTEGER(32) |  | YES | 5 |  |
| `timeout_minutes` | INTEGER(32) |  | YES | 60 |  |
| `priority` | INTEGER(32) |  | YES | 5 |  |
| `job_status` | TEXT |  | YES | 'active'::text |  |
| `last_run_time` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `last_run_status` | TEXT |  | YES |  |  |
| `last_run_duration_seconds` | INTEGER(32) |  | YES |  |  |
| `last_error_message` | TEXT |  | YES |  |  |
| `total_runs` | INTEGER(32) |  | YES | 0 |  |
| `successful_runs` | INTEGER(32) |  | YES | 0 |  |
| `failed_runs` | INTEGER(32) |  | YES | 0 |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |

### system_config.scheduled_notifications

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `scheduled_notification_id` | INTEGER(32) | PK | NO | nextval('system_config.sche... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `scheduled_for` | TIMESTAMP WITH TIME ZONE |  | NO |  |  |
| `notification_type` | TEXT |  | NO |  |  |
| `notification_category` | TEXT |  | NO |  |  |
| `title` | TEXT |  | NO |  |  |
| `message` | TEXT |  | NO |  |  |
| `priority` | TEXT |  | YES | 'normal'::text |  |
| `target_users` | ARRAY |  | YES |  |  |
| `target_roles` | ARRAY |  | YES |  |  |
| `notification_data` | JSONB |  | YES | '{}'::jsonb |  |
| `status` | TEXT |  | YES | 'pending'::text |  |
| `sent_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### system_config.setting_definitions

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `setting_key` | TEXT | PK | NO |  |  |
| `setting_category` | TEXT |  | NO |  |  |
| `setting_type` | TEXT |  | NO |  |  |
| `default_value` | JSONB |  | YES |  |  |
| `description` | TEXT |  | YES |  |  |
| `is_required` | BOOLEAN |  | YES | false |  |
| `is_encrypted` | BOOLEAN |  | YES | false |  |
| `validation_rules` | JSONB |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### system_config.system_health_metrics

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `metric_id` | INTEGER(32) | PK | NO | nextval('system_config.syst... |  |
| `metric_timestamp` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `cpu_usage_percent` | NUMERIC(5,2) |  | YES |  |  |
| `memory_usage_percent` | NUMERIC(5,2) |  | YES |  |  |
| `disk_usage_percent` | NUMERIC(5,2) |  | YES |  |  |
| `active_connections` | INTEGER(32) |  | YES |  |  |
| `total_connections` | INTEGER(32) |  | YES |  |  |
| `slow_queries_count` | INTEGER(32) |  | YES |  |  |
| `deadlock_count` | INTEGER(32) |  | YES |  |  |
| `active_users` | INTEGER(32) |  | YES |  |  |
| `requests_per_minute` | INTEGER(32) |  | YES |  |  |
| `average_response_time_ms` | INTEGER(32) |  | YES |  |  |
| `error_rate_percent` | NUMERIC(5,2) |  | YES |  |  |
| `pending_jobs` | INTEGER(32) |  | YES |  |  |
| `failed_jobs` | INTEGER(32) |  | YES |  |  |
| `cache_hit_rate_percent` | NUMERIC(5,2) |  | YES |  |  |
| `cache_size_mb` | INTEGER(32) |  | YES |  |  |
| `overall_health_status` | TEXT |  | YES |  |  |
| `alerts_triggered` | INTEGER(32) |  | YES | 0 |  |

### system_config.system_integrations

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `integration_id` | INTEGER(32) | PK | NO | nextval('system_config.syst... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `integration_name` | TEXT |  | NO |  |  |
| `integration_type` | TEXT |  | NO |  |  |
| `provider_name` | TEXT |  | YES |  |  |
| `base_url` | TEXT |  | YES |  |  |
| `auth_type` | TEXT |  | YES |  |  |
| `auth_config` | JSONB |  | YES | '{}'::jsonb |  |
| `connection_config` | JSONB |  | YES | '{}'::jsonb |  |
| `endpoints` | JSONB |  | YES | '[]'::jsonb |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `last_test_date` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `last_test_status` | TEXT |  | YES |  |  |
| `health_check_url` | TEXT |  | YES |  |  |
| `health_check_interval_minutes` | INTEGER(32) |  | YES |  |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

### system_config.system_notifications

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `notification_id` | INTEGER(32) | PK | NO | nextval('system_config.syst... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `notification_type` | TEXT |  | NO |  |  |
| `notification_category` | TEXT |  | NO |  |  |
| `title` | TEXT |  | NO |  |  |
| `message` | TEXT |  | NO |  |  |
| `priority` | TEXT |  | YES | 'normal'::text |  |
| `requires_acknowledgment` | BOOLEAN |  | YES | false |  |
| `target_audience` | TEXT |  | NO | 'all'::text | Target audience for the notification. Defaults to "all". Options: all, finance_team, warehouse_team, sales_team, management |
| `target_users` | ARRAY |  | YES |  |  |
| `target_roles` | ARRAY |  | YES |  |  |
| `target_branches` | ARRAY |  | YES |  |  |
| `notification_data` | JSONB |  | YES | '{}'::jsonb |  |
| `action_url` | TEXT |  | YES |  |  |
| `valid_from` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `valid_until` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | YES |  |  |

### system_config.system_settings

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `setting_id` | INTEGER(32) | PK | NO | nextval('system_config.syst... |  |
| `org_id` | UUID | FK→organizations | YES |  |  |
| `setting_category` | TEXT |  | NO |  |  |
| `setting_key` | TEXT |  | NO |  |  |
| `setting_name` | TEXT |  | NO |  |  |
| `setting_value` | TEXT |  | YES |  |  |
| `setting_type` | TEXT |  | NO |  |  |
| `default_value` | TEXT |  | YES |  |  |
| `validation_rules` | JSONB |  | YES | '{}'::jsonb |  |
| `description` | TEXT |  | YES |  |  |
| `help_text` | TEXT |  | YES |  |  |
| `setting_scope` | TEXT |  | NO |  |  |
| `branch_id` | INTEGER(32) | FK→org_branches | YES |  |  |
| `user_id` | INTEGER(32) | FK→org_users | YES |  |  |
| `ui_component` | TEXT |  | YES |  |  |
| `display_order` | INTEGER(32) |  | YES |  |  |
| `group_name` | TEXT |  | YES |  |  |
| `is_sensitive` | BOOLEAN |  | YES | false |  |
| `requires_restart` | BOOLEAN |  | YES | false |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `is_editable` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_by` | INTEGER(32) | FK→org_users | YES |  |  |

### system_config.user_notifications

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `user_notification_id` | INTEGER(32) | PK | NO | nextval('system_config.user... |  |
| `notification_id` | INTEGER(32) | FK→system_notifications | NO |  |  |
| `user_id` | INTEGER(32) | FK→org_users | NO |  |  |
| `is_read` | BOOLEAN |  | YES | false |  |
| `read_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `is_acknowledged` | BOOLEAN |  | YES | false |  |
| `acknowledged_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `is_dismissed` | BOOLEAN |  | YES | false |  |
| `dismissed_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `delivered_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `delivery_channel` | TEXT |  | YES | 'in_app'::text |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### system_config.workflow_definitions

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `workflow_id` | INTEGER(32) | PK | NO | nextval('system_config.work... |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `workflow_code` | TEXT |  | NO |  |  |
| `workflow_name` | TEXT |  | NO |  |  |
| `workflow_type` | TEXT |  | NO |  |  |
| `steps` | JSONB |  | NO | '[]'::jsonb |  |
| `conditions` | JSONB |  | YES | '{}'::jsonb |  |
| `escalation_rules` | JSONB |  | YES | '{}'::jsonb |  |
| `is_active` | BOOLEAN |  | YES | true |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |

### system_config.workflow_instances

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `instance_id` | INTEGER(32) | PK | NO | nextval('system_config.work... |  |
| `workflow_id` | INTEGER(32) | FK→workflow_definitions | NO |  |  |
| `org_id` | UUID | FK→organizations | NO |  |  |
| `instance_code` | TEXT |  | NO |  |  |
| `reference_type` | TEXT |  | NO |  |  |
| `reference_id` | INTEGER(32) |  | NO |  |  |
| `current_step` | INTEGER(32) |  | NO | 1 |  |
| `instance_status` | TEXT |  | NO | 'pending'::text |  |
| `approval_history` | JSONB |  | YES | '[]'::jsonb |  |
| `initiated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `completed_at` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `sla_deadline` | TIMESTAMP WITH TIME ZONE |  | YES |  |  |
| `is_escalated` | BOOLEAN |  | YES | false |  |
| `escalation_level` | INTEGER(32) |  | YES | 0 |  |
| `created_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITH TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `created_by` | INTEGER(32) | FK→org_users | NO |  |  |

## public

**Tables:** `document_number_sequences`

### public.document_number_sequences

| Column | Type | Key | Nullable | Default | Description |
|--------|------|-----|----------|---------|-------------|
| `sequence_id` | INTEGER(32) | PK | NO | nextval('document_number_se... |  |
| `document_type` | CHARACTER VARYING(50) |  | NO |  |  |
| `org_id` | UUID |  | YES |  |  |
| `year_prefix` | CHARACTER VARYING(4) |  | NO |  |  |
| `last_sequence_number` | BIGINT(64) |  | NO | 10000000 |  |
| `last_generated_number` | CHARACTER VARYING(50) |  | YES |  |  |
| `created_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
| `updated_at` | TIMESTAMP WITHOUT TIME ZONE |  | YES | CURRENT_TIMESTAMP |  |
