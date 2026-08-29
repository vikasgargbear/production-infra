export type ExactDecimalString = string;

export interface CanonicalExecutedBatchAllocation {
  source_kind: 'direct_issue' | 'dispatch_allocation';
  allocation_id: string;
  invoice_line_id?: string;
  source_line_id: string;
  command_request_id: string | null;
  command_evidence_count?: number;
  request_line_count?: number;
  evidenced_allocation_count?: number | null;
  evidence_match_count?: number;
  inventory_document_id: string;
  inventory_document_line_id: string;
  invoice_dispatch_allocation_id: string | null;
  dispatch_id: string | null;
  dispatch_line_id: string | null;
  batch_id: string;
  batch_number: string;
  expiry_date: string | null;
  from_location_id: string | null;
  uom_code?: string;
  base_quantity: ExactDecimalString;
  entered_quantity?: ExactDecimalString;
  base_billed_quantity: ExactDecimalString;
  base_free_quantity: ExactDecimalString;
  billed_quantity: ExactDecimalString;
  free_quantity: ExactDecimalString;
}

export interface CanonicalSalesDocumentLine {
  id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  hsn_code: string;
  uom_code: string;
  unit: string;
  quantity: ExactDecimalString;
  free_quantity: ExactDecimalString;
  free_supply_tax_treatment:
    | 'excluded_from_taxable_value'
    | 'included_at_unit_rate';
  unit_price: ExactDecimalString;
  discount_percent: ExactDecimalString;
  gst_percent: ExactDecimalString;
  taxable_amount: ExactDecimalString;
  cgst_amount: ExactDecimalString;
  sgst_amount: ExactDecimalString;
  igst_amount: ExactDecimalString;
  line_total: ExactDecimalString;
  batch_id: string | null;
  batch_number: string | null;
  expiry_date: string | null;
}

export interface CanonicalInvoiceDetailLine extends CanonicalSalesDocumentLine {
  source_document_kind: 'sales_order';
  base_billed_quantity: ExactDecimalString;
  base_free_quantity: ExactDecimalString;
  line_discount_kind: 'none' | 'percent' | 'amount';
  line_discount_basis: 'taxable_value' | 'price_value';
  /** Immutable operator-entered line discount value, never inferred from allocation totals. */
  line_discount_value: ExactDecimalString;
  /** Persisted customer-payable line discount allocation, including any tax effect. */
  line_discount_amount: ExactDecimalString;
  /** Persisted pre-tax line discount allocation used in net-value reconciliation. */
  line_taxable_discount_amount: ExactDecimalString;
  /** Persisted customer-payable invoice-level discount allocated to this line. */
  document_discount_amount: ExactDecimalString;
  /** Persisted pre-tax invoice-level discount allocated to this line. */
  document_taxable_discount_amount: ExactDecimalString;
  cess_amount: ExactDecimalString;
  batch_allocations: CanonicalExecutedBatchAllocation[];
}

export interface CanonicalInvoiceDetail {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  archival_snapshot_state: 'unavailable' | 'captured';
  seller_legal_name: string;
  seller_gstin: string;
  seller_address: string;
  seller_drug_license_numbers: string[];
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_gst_number: string | null;
  customer_drug_license_numbers: string[];
  billing_address: string;
  shipping_address: string;
  seller_gst_evidence: Record<string, unknown>;
  customer_gst_evidence: Record<string, unknown>;
  seller_drug_licence_evidence: Record<string, unknown>;
  customer_drug_licence_evidence: Record<string, unknown>;
  due_date: string | null;
  currency_code: string;
  supply_type: 'intra_state' | 'inter_state' | 'export' | 'sez';
  place_of_supply_state_code: string;
  place_of_supply_display_name: string;
  tax_charge_mechanism: 'normal' | 'reverse_charge';
  subtotal_amount: ExactDecimalString;
  /** Persisted customer-payable discount, including any tax effect. */
  discount_amount: ExactDecimalString;
  /** Pre-tax reduction used to reconcile gross value to net value. */
  pre_tax_discount_amount: ExactDecimalString;
  charges_amount: ExactDecimalString;
  net_value_amount: ExactDecimalString;
  taxable_amount: ExactDecimalString;
  cgst_amount: ExactDecimalString;
  sgst_amount: ExactDecimalString;
  igst_amount: ExactDecimalString;
  cess_amount: ExactDecimalString;
  rounding_adjustment: ExactDecimalString;
  total_amount: ExactDecimalString;
  items: CanonicalInvoiceDetailLine[];
  created_at: string;
  updated_at: string;
}

export interface CanonicalSalesOrderImportLine extends CanonicalSalesDocumentLine {
  source_document_kind: 'sales_order';
  branch_id: string;
  location_id: string;
  uom_conversion_id: string;
  mrp: ExactDecimalString | null;
  available_quantity: ExactDecimalString;
  batch_id: string | null;
  batch_number: string | null;
  eligible_batches: CanonicalSalesOrderEligibleBatch[];
  default_batch_allocations: CanonicalSalesOrderDefaultBatchAllocation[];
}

export interface CanonicalSalesOrderEligibleBatch {
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  location_id: string;
  location_name: string;
  mrp: ExactDecimalString;
  available_quantity: ExactDecimalString;
  available_base_quantity: ExactDecimalString;
  fefo_priority: number;
}

export interface CanonicalSalesOrderDefaultBatchAllocation {
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  location_id: string;
  billed_quantity: ExactDecimalString;
  free_quantity: ExactDecimalString;
  base_billed_quantity: ExactDecimalString;
  base_free_quantity: ExactDecimalString;
}

export interface CanonicalSalesOrderImportDetail {
  order_id: string;
  id: string;
  order_number: string;
  order_date: string;
  dispatch_context_date: string;
  delivery_date: string | null;
  order_status: 'approved';
  status: 'approved';
  customer_id: string;
  customer_name: string;
  total_amount: ExactDecimalString;
  items: CanonicalSalesOrderImportLine[];
  created_at: string;
  updated_at: string;
}

export interface CanonicalChallanImportLine extends CanonicalSalesDocumentLine {
  source_document_kind?: 'delivery_challan';
  branch_id: string;
  uom_conversion_id: string;
  dispatched_quantity: ExactDecimalString;
  mrp: ExactDecimalString;
  batch_id: string;
  batch_number: string;
  batch_allocations: CanonicalExecutedBatchAllocation[];
}

export interface CanonicalChallanImportDetail {
  challan_id: string;
  id: string;
  challan_number: string;
  challan_date: string;
  status: 'posted';
  customer_id: string;
  customer_name: string;
  total_amount: ExactDecimalString;
  items: CanonicalChallanImportLine[];
  created_at: string;
  updated_at: string;
}
