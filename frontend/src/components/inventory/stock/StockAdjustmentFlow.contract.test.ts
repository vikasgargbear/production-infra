import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'StockAdjustmentFlow.tsx'), 'utf8');

describe('StockAdjustmentFlow canonical lifecycle contract', () => {
  it('uses server-resolved cycle-count authority and exact command payloads', () => {
    expect(source).toContain('loadCycleCountEligibility');
    expect(source).toContain('buildCycleCountGainPayload');
    expect(source).toContain('canonicalBusinessContextApi.get()');
    expect(source).toContain('adjustment_date: context.business_date');
    expect(source).not.toContain('indiaLocalDate');
    expect(source).not.toContain("timeZone: 'Asia/Kolkata'");
    expect(source).toContain("reason: 'cycle_count'");
    expect(source).not.toContain('parseInt(');
    expect(source).not.toContain('adjustment_type: adjustmentData.adjustment_type');
    expect(source).toContain('Physical count completed at (UTC)');
    expect(source).toContain('adjustmentData.counted_at');
    expect(source).toContain('requireCanonicalUtcEventTimestamp');
    expect(source).not.toContain('const countedAt = new Date().toISOString()');
  });

  it('preserves separate approval, requester execution, and authoritative readback', () => {
    expect(source).toContain('loadCycleCountReview');
    expect(source).toContain('approveCycleCountReview');
    expect(source).toContain('executeApprovedCycleCount');
    expect(source).toContain('loadAndVerifyCycleCountReadback');
    expect(source).not.toContain('approveAndExecuteCanonicalAction');
  });

  it('does not let preview-only CSV rows masquerade as resolved stock', () => {
    expect(source).toContain('Server resolution required');
    expect(source).not.toContain('Use validated rows');
    expect(source).not.toContain('Validated CSV rows loaded for review');
  });

  it('requires explicit count UOM and evidence choices without example business facts', () => {
    expect(source).toContain('label="Verified physical count sheet"');
    expect(source).toContain('Select count UOM');
    expect(source).toContain("uom_conversion_id: ''");
    expect(source).toContain("uom_multiplier: ''");
    expect(source).toContain("unit: ''");
    expect(source).toContain("const csvContent = 'product_id,batch_id,product_name,adjustment_quantity,reason,product_code,current_stock,notes\\n'");
    expect(source).not.toContain('eligibility.uom_conversions[0]');
    expect(source).not.toContain('availableEvidence[0]');
    expect(source).not.toContain('018f1e5a-7b2c-7abc');
    expect(source).not.toContain("batch_number || 'Default'");
  });

  it('requires canonical product projection fields without compatibility aliases', () => {
    expect(source).toContain('This product is missing its canonical name or product code.');
    expect(source).toContain('product_name: selectedProduct.product_name');
    expect(source).toContain('product_code: selectedProduct.product_code');
    expect(source).not.toContain('selectedProduct.product_name || selectedProduct.name');
    expect(source).not.toContain('selectedProduct.product_code || selectedProduct.code');
  });
});
