import {
  decodeDestructionContext,
  type InventoryDestructionContext,
} from './controlledOperations.api';

const context = (): InventoryDestructionContext => ({
  organization_id: 'd3000000-0000-7000-8000-000000000001',
  organization_timezone: 'Asia/Kolkata',
  business_date: '2026-08-25',
  as_of: '2026-08-25T10:00:00+05:30',
  ready: false,
  blocking_reasons: ['No verified certificate'],
  certificate_upload_available: false,
  certificate_upload_message: 'Unavailable',
  method_code: 'licensed_incineration',
  itc_treatment: 'not_applicable_unregistered',
  certificates: [],
  candidates: [],
});

test('destruction context publishes the reviewed method and tax treatment', () => {
  expect(decodeDestructionContext(context())).toMatchObject({
    method_code: 'licensed_incineration',
    itc_treatment: 'not_applicable_unregistered',
  });
});

test.each([
  ['missing method', { method_code: undefined }],
  ['unreviewed method', { method_code: 'landfill' }],
  ['missing tax treatment', { itc_treatment: undefined }],
  ['unreviewed tax treatment', { itc_treatment: 'reversal_pending' }],
])('destruction context rejects %s', (_label, patch) => {
  expect(() => decodeDestructionContext({ ...context(), ...patch } as InventoryDestructionContext))
    .toThrow('Canonical destruction context is incomplete.');
});
