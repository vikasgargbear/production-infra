import { apiHelpers } from '../../apiClient';
import type { CanonicalCommandExecution, CanonicalCommandPreview } from '../../canonicalOperatorActions';

export type DecimalString = string;
export type CanonicalReturnCommandStatus =
  | 'prepared'
  | 'pending_approval'
  | 'approved'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface CanonicalReturnCommandSummary {
  command_request_id: string;
  command_type: 'sales.return.post' | 'procurement.purchase_return.post';
  return_kind: 'sales' | 'purchase';
  status: CanonicalReturnCommandStatus;
  branch_id: string;
  requested_by_membership_id: string;
  requester_name: string;
  created_at: string;
  expires_at: string;
  approved_at?: string;
  executed_at?: string;
  resource_type?: 'sales_return' | 'purchase_return';
  resource_id?: string;
  failure_code?: string;
  failure_message?: string;
}

export interface CanonicalReturnCommandDetail extends CanonicalReturnCommandSummary, CanonicalCommandPreview {
  resolved_references: Array<Record<string, unknown>>;
  source_versions: Array<Record<string, unknown>>;
  calculation_ruleset: Array<Record<string, unknown>>;
  inventory_impact: Array<Record<string, unknown>>;
  financial_impact: Array<Record<string, unknown>>;
  tax_impact: Array<Record<string, unknown>>;
  policy_warnings: Array<Record<string, unknown>>;
  required_approvals: Array<Record<string, unknown>>;
}

export interface CanonicalReturnLocation {
  id: string;
  code: string;
  name: string;
  location_type: 'quarantine' | 'saleable' | 'cold_storage';
  allows_sale: boolean;
}

export interface CanonicalReturnReasonChoice {
  reason_code: string;
  supported_gst_treatments: Array<'commercial_only' | 'statutory'>;
}

export interface CanonicalSalesReturnLine {
  fulfillment_source: 'dispatch_allocated';
  original_invoice_line_id: string;
  invoice_dispatch_allocation_id: string;
  dispatch_id: string;
  dispatch_line_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  batch_id: string;
  batch_number: string;
  expires_on?: string;
  uom_code: string;
  uom_conversion_factor: DecimalString;
  allocated_base_billed_quantity: DecimalString;
  allocated_base_free_quantity: DecimalString;
  returned_base_billed_quantity: DecimalString;
  returned_base_free_quantity: DecimalString;
  remaining_base_billed_quantity: DecimalString;
  remaining_base_free_quantity: DecimalString;
  returnable_billed_quantity: DecimalString;
  returnable_free_quantity: DecimalString;
  quoted_unit_rate: DecimalString;
  cgst_rate: DecimalString;
  sgst_rate: DecimalString;
  igst_rate: DecimalString;
  cess_rate: DecimalString;
  hsn_code: string;
}

export interface CanonicalSalesReturnContext {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  branch_id: string;
  customer_account_id: string;
  customer_name: string;
  customer_registered: boolean;
  return_date: string;
  blocked_source_line_count: number;
  lines: CanonicalSalesReturnLine[];
  source_capabilities: CanonicalReturnSourceCapability[];
  quarantine_locations: CanonicalReturnLocation[];
  statutory_itc_reversal_evidence: Array<{
    id: string;
    original_filename: string;
    document_date?: string;
    status: 'verified' | 'retained';
    verified_at: string;
  }>;
  return_reason_choices: CanonicalReturnReasonChoice[];
  approval_policy: 'separate_approver';
}

export interface CanonicalPurchaseReturnLine {
  supplier_invoice_line_id: string;
  supplier_invoice_receipt_allocation_id: string;
  goods_receipt_id: string;
  goods_receipt_line_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  batch_id: string;
  batch_number: string;
  expires_on: string;
  from_location_id: string;
  from_location_code: string;
  from_location_name: string;
  from_location_type: 'saleable' | 'cold_storage';
  uom_code: string;
  uom_conversion_factor: DecimalString;
  allocated_base_billed_quantity: DecimalString;
  allocated_base_free_quantity: DecimalString;
  returned_base_billed_quantity: DecimalString;
  returned_base_free_quantity: DecimalString;
  remaining_base_billed_quantity: DecimalString;
  remaining_base_free_quantity: DecimalString;
  returnable_billed_quantity: DecimalString;
  returnable_free_quantity: DecimalString;
  stock_on_hand_base_quantity: DecimalString;
  average_unit_cost: DecimalString;
  quoted_unit_rate: DecimalString;
  cgst_rate: DecimalString;
  sgst_rate: DecimalString;
  igst_rate: DecimalString;
  cess_rate: DecimalString;
  hsn_code: string;
}

export type CanonicalPurchaseReturnTransportMode =
  | 'road'
  | 'rail'
  | 'air'
  | 'ship'
  | 'multimodal'
  | 'in_person';

export type CanonicalLogisticsFieldRequirement = 'required' | 'optional' | 'forbidden';

export interface CanonicalPurchaseReturnLogisticsMode {
  transport_mode: CanonicalPurchaseReturnTransportMode;
  display_name: string;
  distance_required: true;
  minimum_distance_km: DecimalString;
  transporter_requirement: CanonicalLogisticsFieldRequirement;
  vehicle_requirement: 'required' | 'forbidden';
  transport_document_requirement: CanonicalLogisticsFieldRequirement;
  vehicle_type_choices: Array<'regular' | 'over_dimensional_cargo'>;
}

export interface CanonicalPurchaseReturnTransporterChoice {
  party_id: string;
  party_row_version: string;
  legal_name: string;
  gstin?: string;
}

export interface CanonicalPurchaseReturnContext {
  supplier_invoice_id: string;
  supplier_invoice_number: string;
  supplier_invoice_date: string;
  branch_id: string;
  supplier_account_id: string;
  supplier_name: string;
  return_date: string;
  lines: CanonicalPurchaseReturnLine[];
  source_capabilities: CanonicalReturnSourceCapability[];
  supplier_destinations: Array<{
    id: string;
    address_kind: 'registered' | 'shipping' | 'warehouse';
    line1: string;
    line2?: string;
    city: string;
    state_code: string;
    postal_code: string;
  }>;
  logistics_modes: CanonicalPurchaseReturnLogisticsMode[];
  transporter_choices: CanonicalPurchaseReturnTransporterChoice[];
  statutory_gstr2b_credit_notes: Array<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    portal_reference?: string;
    taxable_amount: DecimalString;
    cgst_amount: DecimalString;
    sgst_amount: DecimalString;
    igst_amount: DecimalString;
    cess_amount: DecimalString;
    total_amount: DecimalString;
  }>;
  return_reason_choices: CanonicalReturnReasonChoice[];
  approval_policy: 'separate_approver';
}

export interface CanonicalReturnSourceCapability {
  source_kind: 'dispatch_allocated' | 'direct_issue' | 'invoiced' | 'uninvoiced';
  status: 'supported' | 'blocked';
  code?: 'RETURN_SOURCE_AUTHORITY_UNAVAILABLE';
  retryable: boolean;
  required_authority: string[];
}

export const canonicalReturnsApi = {
  listApprovalInbox: () =>
    apiHelpers.get<CanonicalReturnCommandSummary[]>('/canonical/returns/approval-inbox'),
  listRequesterInbox: () =>
    apiHelpers.get<CanonicalReturnCommandSummary[]>('/canonical/returns/requester-inbox'),
  getRequesterCommand: (commandRequestId: string) =>
    apiHelpers.get<CanonicalReturnCommandDetail>(
      `/canonical/returns/requester/commands/${commandRequestId}`,
    ),
  getSalesContext: (invoiceId: string, returnDate: string) =>
    apiHelpers.get<CanonicalSalesReturnContext>(
      `/canonical/returns/sales-invoices/${invoiceId}/context`,
      { params: { return_date: returnDate }, preserveExactDecimals: true },
    ),
  getPurchaseContext: (invoiceId: string, returnDate: string) =>
    apiHelpers.get<CanonicalPurchaseReturnContext>(
      `/canonical/returns/supplier-invoices/${invoiceId}/context`,
      { params: { return_date: returnDate }, preserveExactDecimals: true },
    ),
  getSalesReadback: (returnId: string) =>
    apiHelpers.get(`/canonical/returns/sales/${returnId}`),
  getPurchaseReadback: (returnId: string) =>
    apiHelpers.get(`/canonical/returns/purchases/${returnId}`),
  getApprovalReview: (commandRequestId: string) =>
    apiHelpers.get<CanonicalReturnCommandDetail>(
      `/canonical/returns/commands/${commandRequestId}/review`,
    ),
  approveAsIndependentReviewer: (
    commandRequestId: string,
    previewHash: string,
    idempotencyKey: string,
  ) => apiHelpers.post<CanonicalCommandExecution>(
    `/web/actions/commands/${commandRequestId}/approve`,
    {
      preview_hash: previewHash,
      approval_intent: 'approve',
      idempotency_key: idempotencyKey,
    },
  ),
  executeAsRequester: (
    commandRequestId: string,
    previewHash: string,
    idempotencyKey: string,
  ) => apiHelpers.post<CanonicalCommandExecution>(
    `/web/actions/commands/${commandRequestId}/execute`,
    {
      preview_hash: previewHash,
      idempotency_key: idempotencyKey,
    },
  ),
};
