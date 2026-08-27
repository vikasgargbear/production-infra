import { buildCommercialReversalPayload, REVERSAL_OPERATIONS } from './commercialReversalCommand';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('commercial reversal command', () => {
  it('maps all three explicit authorities and preserves typed source facts', () => {
    expect(REVERSAL_OPERATIONS).toEqual({
      sales_return: 'sales.return.reversal.prepare',
      purchase_return: 'procurement.purchase_return.reversal.prepare',
      adjustment_note: 'finance.adjustment_note.reversal.prepare',
    });
    expect(buildCommercialReversalPayload({
      kind: 'purchase_return',
      originalResourceId: UUID,
      expectedRowVersion: '7',
      reversalDate: '2026-08-27',
      reason: 'Erroneous duplicate return posting',
      idempotencyKey: 'erp-web-commercial-reversal-prepare:test-0001',
    })).toEqual({
      idempotency_key: 'erp-web-commercial-reversal-prepare:test-0001',
      original_resource_id: UUID,
      expected_row_version: 7,
      reversal_date: '2026-08-27',
      reason: 'Erroneous duplicate return posting',
    });
  });

  it.each([
    ['not-a-uuid', '7', 'Exact posted source UUID is invalid'],
    [UUID, '0', 'Zero row version is invalid'],
    [UUID, '9007199254740992', 'Unsafe row version is invalid'],
  ])('%s: %s', (source, version) => {
    expect(() => buildCommercialReversalPayload({
      kind: 'sales_return',
      originalResourceId: source,
      expectedRowVersion: version,
      reversalDate: '2026-08-27',
      reason: 'Erroneous duplicate return posting',
      idempotencyKey: 'erp-web-commercial-reversal-prepare:test-0002',
    })).toThrow();
  });

  it('accepts verified amendment evidence only as an exact UUID', () => {
    expect(buildCommercialReversalPayload({
      kind: 'adjustment_note',
      originalResourceId: UUID,
      expectedRowVersion: '2',
      reversalDate: '2026-08-27',
      reason: 'Incorrect legal counterparty document',
      amendmentEvidenceAttachmentId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: 'erp-web-commercial-reversal-prepare:test-0003',
    })).toMatchObject({
      amendment_evidence_attachment_id: '22222222-2222-4222-8222-222222222222',
    });
  });
});
