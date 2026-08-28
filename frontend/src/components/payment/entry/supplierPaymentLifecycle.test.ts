import { reconcileCanonicalSupplierPayment } from './supplierPaymentLifecycle';

const paymentId = 'd3000000-0000-7000-8000-000000000099';
const preview: any = {
  command_request_id: 'd3000000-0000-7000-8000-000000000098',
  preview_hash: `sha256:${'a'.repeat(64)}`,
};
const detail = (): any => ({ payment_id: paymentId, status: 'posted' });

test('retains execution identity before readback and retries with GET only', async () => {
  const execute = jest.fn().mockResolvedValue(paymentId);
  const read = jest.fn().mockRejectedValueOnce(new Error('read failed')).mockResolvedValueOnce(detail());
  let retained: string | null = null;
  await expect(reconcileCanonicalSupplierPayment(
    preview, 'stable', retained, execute, read, value => { retained = value; },
  )).rejects.toThrow('read failed');
  expect(retained).toBe(paymentId);
  await expect(reconcileCanonicalSupplierPayment(
    preview, 'stable', retained, execute, read, value => { retained = value; },
  )).resolves.toMatchObject({ payment_id: paymentId });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(2);
});

test('fails closed before retaining an invalid execution identity', async () => {
  const retain = jest.fn();
  await expect(reconcileCanonicalSupplierPayment(
    preview, 'stable', null, jest.fn().mockResolvedValue('legacy-1'), jest.fn(), retain,
  )).rejects.toThrow('no valid supplier-payment identity');
  expect(retain).not.toHaveBeenCalled();
});
