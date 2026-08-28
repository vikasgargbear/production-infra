import fs from 'fs';
import path from 'path';

const source = (relativePath: string): string => fs.readFileSync(
  path.resolve(__dirname, relativePath),
  'utf8',
);

const MASTER_FACT_SURFACES = [
  'masters/CustomerMaster.tsx',
  'masters/SupplierMaster.tsx',
  'customers/CustomerFlow.tsx',
  'suppliers/SupplierFlow.tsx',
  '../../services/api/modules/master/customers.api.ts',
  '../../services/api/modules/master/suppliers.api.ts',
];

describe('master business facts have no browser-invented policy', () => {
  const combined = MASTER_FACT_SURFACES.map(source).join('\n');

  it('does not infer thirty-day terms or an eighty-percent warning policy', () => {
    expect(combined).not.toMatch(/(?:payment|credit)_days\s*:\s*[^\n]*(?:\|\||\?\?)\s*30/);
    expect(combined).not.toContain('* 0.8');
    expect(combined).not.toContain('Near Limit');
  });

  it('does not turn absent limits, terms, or balances into numeric zero', () => {
    expect(combined).not.toMatch(/(?:credit_limit|credit_days|payment_days|current_outstanding)\s*:\s*[^\n]*\|\|\s*0/);
  });

  it('uses only the canonical individual and organization party classifications', () => {
    const customerMaster = source('masters/CustomerMaster.tsx');
    expect(customerMaster).toContain("{ value: 'individual', label: 'Individual' }");
    expect(customerMaster).toContain("{ value: 'organization', label: 'Organization' }");
    expect(customerMaster).not.toMatch(/value: '(retail|wholesale|hospital|clinic|pharmacy)'/);
  });

  it('does not publish or translate unversioned state-name metadata', () => {
    expect(combined).not.toContain('INDIAN_STATES');
    expect(combined).not.toContain("state: 'Maharashtra'");
    expect(combined).not.toMatch(/state:\s*firstDefined\(/);
    expect(combined).toContain('GST state code (2 digits)');
    expect(fs.existsSync(path.resolve(__dirname, '../../utils/indianStates.ts'))).toBe(false);
  });
});
