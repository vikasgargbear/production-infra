import type { Customer } from '../../../../types/models/customer';
import type { Invoice } from '../hooks/useInvoiceLogic';
import type { InvoiceDraftEnvelope } from '../../../../services/api/modules/invoiceDrafts.api';

export interface SalesInvoiceEditorState extends Record<string, unknown> {
  invoice: Record<string, unknown>;
  selected_customer: Record<string, unknown> | null;
  current_step: number;
}

export type SalesInvoiceDraftPayload = InvoiceDraftEnvelope<SalesInvoiceEditorState>;

const decimalField = /(quantity|price|rate|amount|percent|charges|distance|subtotal|total|round_off|value)$/i;

const exactJsonValue = (value: unknown, key = ''): unknown => {
  if (Array.isArray(value)) return value.map((item) => exactJsonValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        exactJsonValue(childValue, childKey),
      ]),
    );
  }
  if (typeof value === 'number' && decimalField.test(key)) {
    if (!Number.isFinite(value)) throw new Error(`${key} must be a finite exact decimal value.`);
    return String(value);
  }
  return value;
};

export const buildSalesInvoiceDraftPayload = (
  invoice: Invoice,
  selectedCustomer: Customer | null,
  currentStep: number,
  commandPayload: Record<string, unknown> | null,
): SalesInvoiceDraftPayload => ({
  schema_version: 'invoice-draft.v1',
  editor_state: {
    invoice: exactJsonValue(invoice) as Record<string, unknown>,
    selected_customer: selectedCustomer
      ? exactJsonValue(selectedCustomer) as Record<string, unknown>
      : null,
    current_step: currentStep,
  },
  command_payload: commandPayload ? exactJsonValue(commandPayload) as Record<string, unknown> : null,
});

export const requireSalesInvoiceDraftState = (value: unknown): SalesInvoiceEditorState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The saved sales invoice draft is invalid.');
  }
  const envelope = value as Partial<SalesInvoiceDraftPayload>;
  const state = envelope.editor_state as Partial<SalesInvoiceEditorState> | undefined;
  if (envelope.schema_version !== 'invoice-draft.v1'
      || !state
      || !state.invoice
      || typeof state.invoice !== 'object'
      || Array.isArray(state.invoice)) {
    throw new Error('The saved sales invoice draft uses an unsupported editor format.');
  }
  return {
    invoice: state.invoice as Record<string, unknown>,
    selected_customer: state.selected_customer && typeof state.selected_customer === 'object'
      ? state.selected_customer as Record<string, unknown>
      : null,
    current_step: Number.isInteger(state.current_step) && Number(state.current_step) >= 1
      ? Math.min(Number(state.current_step), 3)
      : 1,
  };
};
