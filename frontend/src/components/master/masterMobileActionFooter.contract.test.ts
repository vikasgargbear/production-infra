import fs from 'fs';
import path from 'path';

const source = (relativePath: string): string => fs.readFileSync(
  path.resolve(__dirname, relativePath),
  'utf8',
);

describe('master creation action footers clear the global mobile navigation', () => {
  it.each([
    'products/ProductFlow.tsx',
    'suppliers/SupplierFlow.tsx',
  ])('%s keeps its actions above the mobile navigation and returns to the desktop edge', relativePath => {
    const component = source(relativePath);

    expect(component).toContain('bottom-[calc(4rem+env(safe-area-inset-bottom))]');
    expect(component).toContain('md:bottom-0');
  });
});
