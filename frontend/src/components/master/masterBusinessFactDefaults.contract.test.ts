import fs from 'fs';
import path from 'path';

const source = (relativePath: string): string => fs.readFileSync(
  path.resolve(__dirname, relativePath),
  'utf8',
);

const MASTER_FACT_SURFACES = [
  'hooks/useSupplierEdit.ts',
  'hooks/useCustomerEdit.ts',
  'masters/CustomerMaster.tsx',
  'masters/SupplierMaster.tsx',
  'modals/CustomerEditModal.tsx',
  'modals/SupplierEditModal.tsx',
  'suppliers/SupplierFlow.tsx',
  '../purchase/modals/SupplierCreationForm.tsx',
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
});
