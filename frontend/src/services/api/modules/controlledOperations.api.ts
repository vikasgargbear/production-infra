import { apiHelpers } from '../apiClient';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import { normalizeAuthoritativeDecimal } from '../../../utils/exactDecimal';

export interface BankReconciliationCandidate {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  bank_account_id: string;
  bank_name: string;
  bank_account_name: string;
  bank_statement_id: string;
  statement_reference: string;
  bank_statement_line_id: string;
  statement_line_number: number;
  transaction_date: string;
  statement_direction: 'credit' | 'debit';
  matched_amount: string;
  bank_reference: string | null;
  statement_description: string;
  journal_entry_id: string;
  journal_number: string;
  journal_description: string;
  match_methods: Array<'manual' | 'reference_exact'>;
}

export interface BankReconciliationContext {
  organization_id: string;
  business_date: string;
  statement_import_available: false;
  statement_import_message: string;
  candidates: BankReconciliationCandidate[];
}

export interface DestructionCertificate {
  certificate_attachment_id: string;
  original_filename: string;
  document_date: string;
  verified_at: string;
  retention_until: string;
}

export interface DestructionStockCandidate {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  location_id: string;
  location_code: string;
  location_name: string;
  product_id: string;
  product_code: string;
  product_name: string;
  uom_conversion_id: string;
  selected_uom_code: string;
  base_uom_code: string;
  uom_multiplier: string;
  batch_id: string;
  batch_number: string;
  batch_status: 'quarantined' | 'blocked' | 'expired';
  expires_on: string;
  available_selected_quantity: string;
  available_base_quantity: string;
  average_unit_cost: string;
  inventory_value: string;
}

export interface InventoryDestructionContext {
  organization_id: string;
  organization_timezone: string;
  business_date: string;
  as_of: string;
  ready: boolean;
  blocking_reasons: string[];
  certificate_upload_available: false;
  certificate_upload_message: string;
  certificates: DestructionCertificate[];
  candidates: DestructionStockCandidate[];
}

export interface BankReconciliationReadback {
  command_request_id: string;
  reconciliation_match_id: string;
  status: 'matched';
  bank_statement_id: string;
  bank_statement_line_id: string;
  journal_entry_id: string;
  matched_amount: string;
  currency_code: string;
  match_method: 'manual' | 'reference_exact';
  audit_event_count: number;
  outbox_event_count: number;
}

export interface InventoryDestructionReadback {
  command_request_id: string;
  destruction_id: string;
  destruction_number: string;
  status: 'posted';
  certificate_attachment_id: string;
  total_destroyed_base_quantity: string;
  total_destroyed_value: string;
  journal_debit_total: string;
  journal_credit_total: string;
  lines: Array<{
    inventory_document_line_id: string;
    product_id: string;
    batch_id: string;
    destroyed_base_quantity: string;
    destroyed_value: string;
    remaining_on_hand_quantity: string;
    remaining_inventory_value: string;
  }>;
}

function requireUuid(value: unknown, label: string): string {
  if (!isCanonicalUuid(value)) throw new Error(`${label} is not a canonical UUID.`);
  return String(value);
}

export function decodeBankContext(value: BankReconciliationContext): BankReconciliationContext {
  requireUuid(value.organization_id, 'Organization');
  if (value.statement_import_available !== false || !Array.isArray(value.candidates)) {
    throw new Error('Canonical bank reconciliation context is incomplete.');
  }
  value.candidates.forEach((candidate, index) => {
    ['branch_id', 'bank_account_id', 'bank_statement_id', 'bank_statement_line_id', 'journal_entry_id']
      .forEach(field => requireUuid((candidate as any)[field], `Candidate ${index + 1} ${field}`));
    normalizeAuthoritativeDecimal(candidate.matched_amount, `Candidate ${index + 1} amount`, {
      scale: 2, maximumWholeDigits: 18,
    });
    if (!candidate.match_methods.length) throw new Error(`Candidate ${index + 1} has no reviewed match method.`);
  });
  return value;
}

export function decodeDestructionContext(value: InventoryDestructionContext): InventoryDestructionContext {
  requireUuid(value.organization_id, 'Organization');
  if (value.certificate_upload_available !== false
      || !Array.isArray(value.certificates) || !Array.isArray(value.candidates)) {
    throw new Error('Canonical destruction context is incomplete.');
  }
  value.certificates.forEach((row, index) => requireUuid(
    row.certificate_attachment_id, `Certificate ${index + 1}`,
  ));
  value.candidates.forEach((row, index) => {
    ['branch_id', 'location_id', 'product_id', 'uom_conversion_id', 'batch_id']
      .forEach(field => requireUuid((row as any)[field], `Stock candidate ${index + 1} ${field}`));
    normalizeAuthoritativeDecimal(row.available_selected_quantity, `Stock candidate ${index + 1} quantity`, {
      scale: 6, maximumWholeDigits: 14,
    });
    normalizeAuthoritativeDecimal(row.inventory_value, `Stock candidate ${index + 1} value`, {
      scale: 2, maximumWholeDigits: 18,
    });
  });
  return value;
}

export const canonicalControlledOperationsApi = {
  bankContext: async () => {
    const response = await apiHelpers.get<BankReconciliationContext>('/canonical/bank-reconciliation/context');
    response.data = decodeBankContext(response.data);
    return response;
  },
  destructionContext: async () => {
    const response = await apiHelpers.get<InventoryDestructionContext>('/canonical/inventory-destruction/context');
    response.data = decodeDestructionContext(response.data);
    return response;
  },
  bankReadback: (commandRequestId: string) => {
    requireUuid(commandRequestId, 'Bank reconciliation command');
    return apiHelpers.get<BankReconciliationReadback>(
      `/web/actions/bank-reconciliation/commands/${commandRequestId}/readback`,
    );
  },
  destructionReadback: (commandRequestId: string) => {
    requireUuid(commandRequestId, 'Destruction command');
    return apiHelpers.get<InventoryDestructionReadback>(
      `/web/actions/inventory-destruction/commands/${commandRequestId}/readback`,
    );
  },
};
