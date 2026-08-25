import fs from 'fs';
import path from 'path';

const srcRoot = path.resolve(__dirname, '../..');

const productionSources = (directory: string): string[] => fs.readdirSync(directory, {
  withFileTypes: true,
}).flatMap(entry => {
  const absolute = path.join(directory, entry.name);
  if (entry.isDirectory()) return productionSources(absolute);
  if (!/\.(ts|tsx)$/.test(entry.name) || /\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
  return [absolute];
});

describe('retired inventory browser surfaces', () => {
  it('does not retain the generic stock and movement API clients', () => {
    expect(fs.existsSync(path.join(srcRoot, 'services/api/modules/inventory/stock.api.ts'))).toBe(false);
    expect(fs.existsSync(path.join(srcRoot, 'services/api/modules/inventory/inventoryMovements.api.ts'))).toBe(false);
    expect(fs.existsSync(path.join(srcRoot, 'components/inventory/StockListHistory.tsx'))).toBe(false);
  });

  it('contains no production caller for a retired legacy inventory route', () => {
    const retired = /['"]\/(?:inventory(?:\/|['"])|stock-adjustments|stock-movements|stock-writeoff)/;
    const findings = productionSources(srcRoot).flatMap(file => {
      const source = fs.readFileSync(file, 'utf8');
      return retired.test(source) ? [path.relative(srcRoot, file)] : [];
    });
    expect(findings).toEqual([]);
  });
});
