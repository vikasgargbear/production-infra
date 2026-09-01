import { apiHelpers } from '../apiClient';
import { invoiceDraftIdFromLocation, invoiceDraftMutationError, invoiceDraftsApi } from './invoiceDrafts.api';

jest.mock('../apiClient', () => ({
  apiHelpers: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const draftId = '10000000-0000-7000-8000-000000000001';

describe('shared invoice draft transport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves an incomplete exact-string authoring envelope without preparing or posting', () => {
    const payload = {
      schema_version: 'invoice-draft.v1' as const,
      editor_state: {
        invoice: { items: [{ quantity: '1.500000', unit_price: '10.2500' }] },
        selected_customer: null,
        current_step: 1,
      },
      command_payload: null,
    };
    invoiceDraftsApi.create({
      document_kind: 'sales_invoice',
      branch_id: '10000000-0000-7000-8000-000000000002',
      title: 'Incomplete invoice',
      payload,
      created_via: 'web',
    });

    expect(apiHelpers.post).toHaveBeenCalledWith(
      '/canonical/invoice-drafts',
      expect.objectContaining({ payload }),
      { preserveExactDecimals: true },
    );
    expect(apiHelpers.post).toHaveBeenCalledTimes(1);
  });

  it('uses expected row_version for update and exact-revision prepare', () => {
    const payload = {
      schema_version: 'invoice-draft.v1' as const,
      editor_state: {} as Record<string, unknown>,
      command_payload: { billed_quantity: '2.000000', quoted_unit_rate: '99.2500' },
    };
    invoiceDraftsApi.update(draftId, { expected_row_version: 7, payload });
    invoiceDraftsApi.prepare(draftId, 8);

    expect(apiHelpers.patch).toHaveBeenCalledWith(
      `/canonical/invoice-drafts/${draftId}`,
      { expected_row_version: 7, payload },
      { preserveExactDecimals: true },
    );
    expect(apiHelpers.post).toHaveBeenCalledWith(
      `/canonical/invoice-drafts/${draftId}/prepare`,
      { expected_row_version: 8 },
      { preserveExactDecimals: true },
    );
    expect(apiHelpers.post).toHaveBeenCalledTimes(1);
  });

  it('loads all discoverable states so prepared drafts can be resumed', () => {
    invoiceDraftsApi.list('sales_invoice', { limit: 50 });
    expect(apiHelpers.get).toHaveBeenCalledWith('/canonical/invoice-drafts', {
      preserveExactDecimals: true,
      params: { document_kind: 'sales_invoice', limit: 50, offset: 0 },
    });
  });

  it('resolves a usable hash-routed MCP edit link', () => {
    expect(invoiceDraftIdFromLocation({
      hash: `#/purchase/supplier-invoice?draft=${draftId}`,
      search: '',
    })).toBe(draftId);
  });

  it('turns a row-version conflict into a fail-closed reopen message', () => {
    expect(invoiceDraftMutationError({ response: { status: 409 } }).message).toContain(
      'Your edits are still on screen',
    );
  });

  it('surfaces field-level validation details instead of a generic 422', () => {
    expect(invoiceDraftMutationError({
      response: {
        status: 422,
        data: {
          detail: [{ loc: ['body', 'payload', 'editor_state', 'current_step'], msg: 'Input should be a valid integer' }],
        },
      },
    }).message).toBe('payload.editor_state.current_step: Input should be a valid integer');
  });
});
