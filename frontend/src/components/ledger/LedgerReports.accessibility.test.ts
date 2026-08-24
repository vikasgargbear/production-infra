import fs from 'fs';
import path from 'path';

test('refresh loading indicator is not exposed as an unusable icon-only control', () => {
    const source = fs.readFileSync(path.join(__dirname, 'LedgerReports.tsx'), 'utf8');
    expect(source).toContain('label: "Refresh"');
    expect(source).toContain('<RefreshCw aria-hidden="true"');
    expect(source).toContain('animate-spin');
    expect(source).not.toMatch(/<RefreshCw[^>]*onClick=/);
});
