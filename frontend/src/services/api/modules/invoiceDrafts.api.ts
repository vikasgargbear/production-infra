import type { CanonicalCommandPreview } from '../canonicalOperatorActions';
import { apiHelpers } from '../apiClient';

export type InvoiceDraftKind = 'sales_invoice' | 'supplier_invoice';
export type InvoiceDraftStatus = 'open' | 'abandoned' | 'prepared' | 'posted';
export type InvoiceDraftCreatedVia = 'web' | 'mcp';

export interface InvoiceDraftEnvelope<TEditorState extends Record<string, unknown>> extends Record<string, unknown> {
  schema_version: 'invoice-draft.v1';
  editor_state: TEditorState;
  command_payload: Record<string, unknown> | null;
}

export interface InvoiceDraft<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  draft_id: string;
  document_kind: InvoiceDraftKind;
  branch_id: string;
  title: string | null;
  payload: TPayload;
  status: InvoiceDraftStatus;
  created_via: InvoiceDraftCreatedVia;
  row_version: number;
  prepared_command_request_id: string | null;
  posted_resource_id: string | null;
  created_at: string;
  updated_at: string;
  edit_path?: string;
}

export interface InvoiceDraftList<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  drafts: Array<InvoiceDraft<TPayload>>;
  total: number;
}

export interface CreateInvoiceDraftRequest<TPayload extends Record<string, unknown>> {
  document_kind: InvoiceDraftKind;
  branch_id: string;
  title?: string;
  payload: TPayload;
  created_via: 'web';
}

export interface UpdateInvoiceDraftRequest<TPayload extends Record<string, unknown>> {
  expected_row_version: number;
  title?: string;
  payload: TPayload;
}

const preserveExactDecimals = { preserveExactDecimals: true } as const;
const base = '/canonical/invoice-drafts';

export const invoiceDraftsApi = {
  list: <TPayload extends Record<string, unknown> = Record<string, unknown>>(
    documentKind: InvoiceDraftKind,
    options: { status?: InvoiceDraftStatus; limit?: number; offset?: number } = {},
  ) => apiHelpers.get<InvoiceDraftList<TPayload>>(base, {
    ...preserveExactDecimals,
    params: {
      document_kind: documentKind,
      ...(options.status ? { status: options.status } : {}),
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    },
  }),

  get: <TPayload extends Record<string, unknown> = Record<string, unknown>>(draftId: string) =>
    apiHelpers.get<InvoiceDraft<TPayload>>(`${base}/${encodeURIComponent(draftId)}`, preserveExactDecimals),

  create: <TPayload extends Record<string, unknown>>(request: CreateInvoiceDraftRequest<TPayload>) =>
    apiHelpers.post<InvoiceDraft<TPayload>>(base, request, preserveExactDecimals),

  update: <TPayload extends Record<string, unknown>>(
    draftId: string,
    request: UpdateInvoiceDraftRequest<TPayload>,
  ) => apiHelpers.patch<InvoiceDraft<TPayload>>(
    `${base}/${encodeURIComponent(draftId)}`,
    request,
    preserveExactDecimals,
  ),

  abandon: <TPayload extends Record<string, unknown> = Record<string, unknown>>(
    draftId: string,
    expectedRowVersion: number,
  ) => apiHelpers.post<InvoiceDraft<TPayload>>(
    `${base}/${encodeURIComponent(draftId)}/abandon`,
    { expected_row_version: expectedRowVersion },
    preserveExactDecimals,
  ),

  prepare: (
    draftId: string,
    expectedRowVersion: number,
  ) => apiHelpers.post<CanonicalCommandPreview>(
    `${base}/${encodeURIComponent(draftId)}/prepare`,
    { expected_row_version: expectedRowVersion },
    preserveExactDecimals,
  ),
};

export const invoiceDraftIdFromLocation = (location: Pick<Location, 'hash' | 'search'>): string | null => {
  const hashQuery = location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?') + 1) : '';
  return new URLSearchParams(hashQuery).get('draft')
    || new URLSearchParams(location.search).get('draft');
};

export const invoiceDraftMutationError = (error: unknown): Error => {
  const apiError = error as {
    message?: string;
    response?: { status?: number; data?: { detail?: unknown } };
  };
  if (apiError.response?.status === 409) {
    return new Error('This draft changed in another session. Your edits are still on screen; reopen the latest draft before saving.');
  }
  const detail = apiError.response?.data?.detail;
  if (typeof detail === 'string') return new Error(detail);
  if (Array.isArray(detail)) {
    const messages = detail
      .map(item => {
        if (!item || typeof item !== 'object') return '';
        const issue = item as { loc?: unknown; msg?: unknown };
        const location = Array.isArray(issue.loc)
          ? issue.loc.filter(part => part !== 'body').join('.')
          : '';
        const message = typeof issue.msg === 'string' ? issue.msg : '';
        return [location, message].filter(Boolean).join(': ');
      })
      .filter(Boolean);
    if (messages.length) return new Error(messages.join('; '));
  }
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return new Error(String((detail as { message?: unknown }).message || 'Invoice draft request failed.'));
  }
  return new Error(apiError.message || 'Invoice draft request failed.');
};
