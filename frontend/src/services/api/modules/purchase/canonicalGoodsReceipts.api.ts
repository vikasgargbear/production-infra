import type { AxiosResponse } from 'axios';

import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import { apiHelpers } from '../../apiClient';


export interface CanonicalReceiptLocation {
  id: string;
  code: string;
  name: string;
  location_type: 'saleable' | 'quarantine' | 'cold_storage';
}

export interface CanonicalReceiptMrpConversion {
  id: string;
  from_uom_code: string;
  to_uom_code: string;
  multiplier: string;
}

export interface CanonicalReceiptContextLine {
  purchase_order_line_id: string;
  line_number: number;
  product_id: string;
  product_name: string;
  sku: string;
  ordered_uom_code: string;
  base_uom_code: string;
  uom_conversion_factor: string;
  ordered_billed_quantity: string;
  ordered_free_quantity: string;
  remaining_billed_quantity: string;
  remaining_free_quantity: string;
  eligible_locations: CanonicalReceiptLocation[];
  mrp_conversions: CanonicalReceiptMrpConversion[];
}

export interface CanonicalReceiptContext {
  purchase_order_id: string;
  purchase_order_number: string;
  branch_id: string;
  supplier_account_id: string;
  supplier_name: string;
  status: 'approved' | 'partially_received';
  lines: CanonicalReceiptContextLine[];
}

export interface CanonicalReceiptInventoryEvidence {
  inventory_document_line_id: string;
  inventory_document_id: string;
  movement_kind: 'receipt';
  entered_quantity: string;
  base_quantity: string;
  unit_cost: string;
  extended_cost: string;
  ledger_entry_id: string;
  ledger_quantity_delta: string;
  ledger_value_delta: string;
  current_on_hand_quantity: string;
  current_inventory_value: string;
  current_average_unit_cost: string;
}

export interface CanonicalReceiptDetailLine {
  goods_receipt_line_id: string;
  line_number: number;
  purchase_order_line_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  batch_id: string;
  manufacturer_batch_number: string;
  manufactured_on?: string | null;
  expires_on: string;
  mrp: string;
  batch_status: string;
  location_id: string;
  location_code: string;
  location_name: string;
  location_type: string;
  uom_code: string;
  received_quantity: string;
  accepted_quantity: string;
  rejected_quantity: string;
  free_quantity: string;
  base_accepted_quantity: string;
  base_free_quantity: string;
  qc_status: string;
  qc_notes?: string | null;
  unit_cost: string;
  extended_cost: string;
  inventory: CanonicalReceiptInventoryEvidence;
}

export interface CanonicalReceiptDetail {
  goods_receipt_id: string;
  goods_receipt_number: string;
  branch_id: string;
  supplier_account_id: string;
  supplier_name: string;
  purchase_order_id: string;
  purchase_order_number: string;
  received_at: string;
  supplier_challan_number?: string | null;
  supplier_challan_date?: string | null;
  status: 'posted';
  posted_at: string;
  inventory_document_id: string;
  inventory_document_number: string;
  inventory_document_status: 'posted';
  costing_method: 'moving_weighted_average';
  total_abs_base_quantity: string;
  total_inventory_value: string;
  impact_scope: 'inventory_only_reference_no_payable_or_itc';
  tax_impact: [];
  journal_impact: [];
  lines: CanonicalReceiptDetailLine[];
}

function requireUuid(value: string, label: string): string {
  if (!isCanonicalUuid(value)) {
    throw new Error(`${label} must be a canonical UUID`);
  }
  return value;
}

export const canonicalGoodsReceiptsApi = {
  getPurchaseOrderContext(
    purchaseOrderId: string,
  ): Promise<AxiosResponse<CanonicalReceiptContext>> {
    const id = requireUuid(purchaseOrderId, 'Purchase order identity');
    return apiHelpers.get(
      `/canonical/goods-receipts/purchase-orders/${id}/context`,
    );
  },

  getDetail(goodsReceiptId: string): Promise<AxiosResponse<CanonicalReceiptDetail>> {
    const id = requireUuid(goodsReceiptId, 'Goods receipt identity');
    return apiHelpers.get(`/canonical/goods-receipts/${id}`);
  },
};
