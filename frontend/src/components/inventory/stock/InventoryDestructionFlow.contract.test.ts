import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, 'InventoryDestructionFlow.tsx'), 'utf8');

it('uses canonical eligibility, evidence, command lifecycle and exact readback', () => {
  expect(source).toContain('canonicalControlledOperationsApi.destructionContext');
  expect(source).toContain('method_code: context.method_code');
  expect(source).toContain('itc_treatment: context.itc_treatment');
  expect(source).not.toContain("method_code: 'licensed_incineration'");
  expect(source).not.toContain("itc_treatment: 'not_applicable_unregistered'");
  expect(source).toContain("prepareCanonicalAction('inventory.destruction.prepare'");
  expect(source).toContain('inventory_document_line_id: lineId.current');
  expect(source).toContain("getCanonicalCommandReview(commandId.trim())");
  expect(source).toContain("approveCanonicalAction('inventory.destruction.prepare'");
  expect(source).toContain("executeApprovedCanonicalAction('inventory.destruction.prepare'");
  expect(source).toContain('canonicalControlledOperationsApi.destructionReadback');
  expect(source).toContain('Physical destruction completed at (UTC)');
  expect(source).toContain('requireCanonicalUtcEventTimestamp');
  expect(source).toContain('physicalConfirmedAt');
  expect(source).not.toContain('new Date().toISOString()');
});

it('does not infer evidence, partial quantities, legacy writes or fake success', () => {
  expect(source).toContain('Certificate upload unavailable');
  expect(source).toContain('Partial quantity editing is intentionally unavailable');
  expect(source).toContain('candidate.available_selected_quantity');
  expect(source).not.toContain('localStorage');
  expect(source).not.toContain('stockApi.adjust');
  expect(source).not.toContain('paymentsApi');
});
