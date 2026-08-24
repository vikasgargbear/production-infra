import { apiHelpers } from '../../apiClient';
import type { CanonicalCommandExecution, CanonicalCommandPreview } from '../../canonicalOperatorActions';

export type DecimalString = string;

export interface CanonicalReturnLocation {
  id: string;
  code: string;
  name: string;
  location_type: 'quarantine' | 'saleable' | 'cold_storage';
  allows_sale: boolean;
}

export interface CanonicalSalesReturnLine {
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
  lines: CanonicalSalesReturnLine[];
  quarantine_locations: CanonicalReturnLocation[];
  statutory_itc_reversal_evidence: Array<{
    id: string;
    original_filename: string;
    document_date?: string;
    status: 'verified' | 'retained';
    verified_at: string;
  }>;
  supported_gst_treatments: Array<'commercial_only' | 'statutory'>;
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

export interface CanonicalPurchaseReturnContext {
  supplier_invoice_id: string;
  supplier_invoice_number: string;
  supplier_invoice_date: string;
  branch_id: string;
  supplier_account_id: string;
  supplier_name: string;
  return_date: string;
  lines: CanonicalPurchaseReturnLine[];
  supplier_destinations: Array<{
    id: string;
    address_kind: 'registered' | 'shipping' | 'warehouse';
    line1: string;
    line2?: string;
    city: string;
    state_code: string;
    postal_code: string;
  }>;
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
  supported_gst_treatments: Array<'commercial_only' | 'statutory'>;
  approval_policy: 'separate_approver';
}

export const canonicalReturnsApi = {
  getSalesContext: (invoiceId: string, returnDate: string) =>
    apiHelpers.get<CanonicalSalesReturnContext>(
      `/canonical/returns/sales-invoices/${invoiceId}/context`,
      { params: { return_date: returnDate } },
    ),
  getPurchaseContext: (invoiceId: string, returnDate: string) =>
    apiHelpers.get<CanonicalPurchaseReturnContext>(
      `/canonical/returns/supplier-invoices/${invoiceId}/context`,
      { params: { return_date: returnDate } },
    ),
  getSalesReadback: (returnId: string) =>
    apiHelpers.get(`/canonical/returns/sales/${returnId}`),
  getPurchaseReadback: (returnId: string) =>
    apiHelpers.get(`/canonical/returns/purchases/${returnId}`),
  getApprovalReview: (commandRequestId: string) =>
    apiHelpers.get<CanonicalCommandPreview>(
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
};
