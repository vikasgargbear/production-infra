import fs from 'fs';
import path from 'path';

const source = (relativePath: string) => fs.readFileSync(
  path.join(__dirname, relativePath),
  'utf8',
);

describe('truthful report controls', () => {
  it.each([
    ['../payment/reports/PaymentReports.tsx', 'Export'],
  ])('%s does not present an unimplemented %s action as enabled', (relativePath, label) => {
    const contents = source(relativePath);
    const labelIndex = contents.lastIndexOf(label);
    expect(labelIndex).toBeGreaterThan(0);
    const openingControl = contents.slice(Math.max(0, labelIndex - 500), labelIndex);
    expect(openingControl).toContain('disabled');
    expect(openingControl).toContain('canonical report contract');
  });
});
