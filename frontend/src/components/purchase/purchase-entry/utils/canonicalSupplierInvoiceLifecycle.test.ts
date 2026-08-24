import { reconcileCanonicalSupplierInvoice } from './canonicalSupplierInvoiceLifecycle';

const resourceId = 'd3000000-0000-7000-8000-000000000099';
const prepared: any = {
  command_request_id: 'd3000000-0000-7000-8000-000000000098',
  preview_hash: `sha256:${'a'.repeat(64)}`,
};

const detail = (): any => ({
  supplier_invoice_id: resourceId,
  status: 'posted',
});
test('retains execution identity before readback and retries read-only', async () => {
  const execute = jest.fn().mockResolvedValue({ status: 'succeeded', resource_id: resourceId });
  const readDetail = jest.fn()
    .mockRejectedValueOnce(new Error('transient read failure'))
    .mockResolvedValueOnce(detail());
  let retained: string | null = null;

  await expect(reconcileCanonicalSupplierInvoice(
    prepared, 'stable-lifecycle', retained, execute, readDetail,
    (value) => { retained = value; },
  )).rejects.toThrow('transient read failure');
  expect(retained).toBe(resourceId);

  await expect(reconcileCanonicalSupplierInvoice(
    prepared, 'stable-lifecycle', retained, execute, readDetail,
    (value) => { retained = value; },
  )).resolves.toMatchObject({ resourceId });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(readDetail).toHaveBeenCalledTimes(2);
});

test('fails closed on a mismatched readback identity', async () => {
  await expect(reconcileCanonicalSupplierInvoice(
    prepared,
    'stable-lifecycle',
    resourceId,
    jest.fn(),
    jest.fn().mockResolvedValue({ ...detail(), supplier_invoice_id: 'd3000000-0000-7000-8000-000000000097' }),
    jest.fn(),
  )).rejects.toThrow('does not match');
});

test('does not retain a failed or identity-less execution', async () => {
  const retain = jest.fn();
  await expect(reconcileCanonicalSupplierInvoice(
    prepared,
    'stable-lifecycle',
    null,
    jest.fn().mockResolvedValue({ status: 'failed' }),
    jest.fn(),
    retain,
  )).rejects.toThrow('ended in failed');
  expect(retain).not.toHaveBeenCalled();
});
