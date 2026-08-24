import { apiHelpers } from '../../apiClient';

export interface CanonicalEligibleReceipt {
  goods_receipt_id: string;
  goods_receipt_number: string;
  received_at: string;
  branch_id: string;
  supplier_account_id: string;
  supplier_name: string;
  purchase_order_id: string;
  purchase_order_number: string;
  remaining_line_count: number;
  remaining_capitalized_value: string;
}

export interface CanonicalSupplierInvoiceContextLine {
  goods_receipt_id: string;
  goods_receipt_number: string;
  goods_receipt_line_id: string;
  goods_receipt_line_number: number;
  purchase_order_line_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  hsn_code: string;
  uom_code: string;
  uom_conversion_factor: string;
  remaining_base_billed_quantity: string;
  remaining_base_free_quantity: string;
  remaining_billed_quantity: string;
  remaining_free_quantity: string;
  receipt_unit_cost: string;
  remaining_capitalized_value: string;
  suggested_quoted_unit_rate: string;
  suggested_price_basis: 'tax_exclusive' | 'tax_inclusive';
  suggested_free_supply_tax_treatment: 'excluded_from_taxable_value' | 'included_at_unit_rate';
  suggested_line_discount_kind: 'none' | 'percent' | 'amount';
  suggested_line_discount_basis: 'taxable_value' | 'price_value';
  suggested_line_discount_value: string;
}

export interface CanonicalSupplierInvoiceContext {
  ready: boolean;
  blocking_reasons: string[];
  branch_id: string;
  buyer_tax_registration_id: string | null;
  buyer_gstin: string | null;
  supplier_account_id: string;
  supplier_name: string;
  supplier_tax_registration_id: string | null;
  supplier_gstin: string | null;
  purchase_order_id: string;
  document_discount_kind: 'none' | 'percent' | 'amount';
  document_discount_basis: 'taxable_value' | 'price_value';
  document_discount_value: string;
  rounding_policy: 'none' | 'nearest_rupee';
  goods_receipt_ids: string[];
  portal_evidence: null | {
    portal_document_id: string;
    portal_document_line_id: string;
    source_sha256: string;
    source_row_hash: string;
    supplier_gstin: string;
    invoice_number: string;
    invoice_date: string;
    taxable_amount: string;
    cgst_amount: string;
    sgst_amount: string;
    igst_amount: string;
    cess_amount: string;
    total_amount: string;
  };
  lines: CanonicalSupplierInvoiceContextLine[];
  expense_charge_lines: Array<{
    purchase_order_line_id: string;
    expense_charge_code: 'freight' | 'packing' | 'insurance' | 'handling';
    quoted_amount: string;
    expense_price_basis: 'tax_exclusive' | 'tax_inclusive';
    expense_document_discount_eligible: boolean;
    net_value_account_id: string;
    account_code: string;
    account_name: string;
  }>;
  inventory_effect: 'already_capitalized_by_goods_receipt';
  supplier_invoice_inventory_value_delta: string;
}

export interface CanonicalPostedSupplierInvoice {
  supplier_invoice_id: string;
  supplier_invoice_number: string;
  status: 'posted';
  supplier_name: string;
  grand_total: string;
  cgst_total: string;
  sgst_total: string;
  igst_total: string;
  cess_total: string;
  open_item_id: string;
  open_item_status: 'open' | 'settled';
  open_item_principal: string;
  journal_entry_id: string;
  journal_number: string;
  journal_debit_total: string;
  journal_credit_total: string;
  supplier_invoice_inventory_document_count: number;
  supplier_invoice_inventory_value_delta: string;
  lines: Array<{
    supplier_invoice_line_id: string;
    product_name: string | null;
    billed_quantity: string | null;
    free_quantity: string | null;
    net_value_amount: string;
    line_total: string;
    allocations: Array<{
      allocation_id: string;
      goods_receipt_line_id: string;
      capitalized_value: string;
    }>;
  }>;
}

export const canonicalSupplierInvoicesApi = {
  eligibleReceipts: async () => apiHelpers.get<{ receipts: CanonicalEligibleReceipt[] }>(
    '/canonical/supplier-invoices/eligible-receipts',
  ),

  context: async (request: {
    goodsReceiptId: string;
    supplierInvoiceNumber: string;
    invoiceDate: string;
  }) => apiHelpers.get<CanonicalSupplierInvoiceContext>(
    '/canonical/supplier-invoices/context',
    {
      params: {
        goods_receipt_id: request.goodsReceiptId,
        supplier_invoice_number: request.supplierInvoiceNumber,
        invoice_date: request.invoiceDate,
      },
    },
  ),

  detail: async (supplierInvoiceId: string) => apiHelpers.get<CanonicalPostedSupplierInvoice>(
    `/canonical/supplier-invoices/${encodeURIComponent(supplierInvoiceId)}`,
  ),
};
