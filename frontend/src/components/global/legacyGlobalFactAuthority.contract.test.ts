import fs from 'fs';
import path from 'path';

const globalRoot = path.resolve(__dirname);

describe('retired global business-fact authorities', () => {
  it('keeps dead GST, payment-term, and party-default components absent', () => {
    for (const relativePath of [
      'ui/GSTCalculator.tsx',
      'ui/display/PaymentDetails.tsx',
      'edit/PartyEditModal.tsx',
    ]) {
      expect(fs.existsSync(path.join(globalRoot, relativePath))).toBe(false);
    }

    const exports = fs.readFileSync(path.join(globalRoot, 'index.ts'), 'utf8');
    expect(exports).not.toContain('GSTCalculator');
    expect(exports).not.toContain('PaymentDetails');
    expect(exports).not.toContain('PartyEditModal');
  });
});
