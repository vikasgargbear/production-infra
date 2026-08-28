import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, 'SupplierAdvance.tsx'), 'utf8');

it('uses the canonical maker-checker-execute and exact readback lifecycle', () => {
  expect(source).toContain('canonicalSupplierAdvancesApi.getContext');
  expect(source).toContain('prepareSupplierAdvance');
  expect(source).toContain('getCanonicalCommandReview');
  expect(source).toContain('approveCanonicalAction');
  expect(source).toContain('getCanonicalCommandStatus');
  expect(source).toContain('executeApprovedSupplierAdvance');
  expect(source).toContain('reconcileSupplierAdvance');
  expect(source).toContain('Independent checker approval');
});

it('has no legacy, offline, browser-storage, or fake-success path', () => {
  expect(source).not.toContain('localStorage');
  expect(source).not.toContain('sessionStorage');
  expect(source).not.toContain('indexedDB');
  expect(source).not.toMatch(/paymentsApi\.|createPayment|toast\.success/);
});
