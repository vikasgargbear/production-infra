import type { InvoiceDraftEnvelope } from '../../../../services/api/modules/invoiceDrafts.api';
import type { LandedCostAllocationMethod } from '../../../../services/api/modules/purchase/canonicalSupplierInvoices.api';

export interface SupplierInvoiceEditorState extends Record<string, unknown> {
  selected_receipt_id: string;
  invoice_number: string;
  invoice_date: string;
  received_date: string;
  rates: Record<string, string>;
  allocation_methods: Record<string, LandedCostAllocationMethod | ''>;
  charge_allocation_methods: Record<string, LandedCostAllocationMethod | ''>;
  itc_attested: boolean;
}

export type SupplierInvoiceDraftPayload = InvoiceDraftEnvelope<SupplierInvoiceEditorState>;

export const buildSupplierInvoiceDraftPayload = (
  editorState: SupplierInvoiceEditorState,
  commandPayload: Record<string, unknown> | null,
): SupplierInvoiceDraftPayload => ({
  schema_version: 'invoice-draft.v1',
  editor_state: editorState,
  command_payload: commandPayload,
});

export const requireSupplierInvoiceDraftState = (value: unknown): SupplierInvoiceEditorState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The saved supplier invoice draft is invalid.');
  }
  const envelope = value as Partial<SupplierInvoiceDraftPayload>;
  const state = envelope.editor_state as Partial<SupplierInvoiceEditorState> | undefined;
  if (envelope.schema_version !== 'invoice-draft.v1' || !state) {
    throw new Error('The saved supplier invoice draft uses an unsupported editor format.');
  }
  const stringRecord = (candidate: unknown, label: string): Record<string, string> => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`The saved supplier invoice ${label} is invalid.`);
    }
    return Object.fromEntries(Object.entries(candidate).map(([key, item]) => [key, String(item)]));
  };
  return {
    selected_receipt_id: String(state.selected_receipt_id || ''),
    invoice_number: String(state.invoice_number || ''),
    invoice_date: String(state.invoice_date || ''),
    received_date: String(state.received_date || ''),
    rates: stringRecord(state.rates || {}, 'rates'),
    allocation_methods: stringRecord(state.allocation_methods || {}, 'allocation methods') as Record<string, LandedCostAllocationMethod | ''>,
    charge_allocation_methods: stringRecord(state.charge_allocation_methods || {}, 'charge allocation methods') as Record<string, LandedCostAllocationMethod | ''>,
    itc_attested: state.itc_attested === true,
  };
};
