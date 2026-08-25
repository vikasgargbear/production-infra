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
  base_billed_quantity: ExactDecimalString;
  base_free_quantity: ExactDecimalString;
  cess_amount: ExactDecimalString;
  batch_allocations: CanonicalExecutedBatchAllocation[];
}

export interface CanonicalInvoiceDetail {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  seller_legal_name: string;
  seller_gstin: string;
  seller_address: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_gst_number: string | null;
  billing_address: string;
  shipping_address: string;
  due_date: string | null;
  currency_code: string;
  taxable_amount: ExactDecimalString;
  cgst_amount: ExactDecimalString;
  sgst_amount: ExactDecimalString;
  igst_amount: ExactDecimalString;
  cess_amount: ExactDecimalString;
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
  mrp: ExactDecimalString;
  available_quantity: ExactDecimalString;
  batch_id: string;
  batch_number: string;
}

export interface CanonicalSalesOrderImportDetail {
  order_id: string;
  id: string;
  order_number: string;
  order_date: string;
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
