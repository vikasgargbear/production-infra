import fs from 'fs';
import path from 'path';

const source = (relativePath: string) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

describe('displayed desktop keyboard shortcuts', () => {
  it('shows only implemented shortcuts on stock and financial report surfaces', () => {
    const stockMovement = source('../../inventory/stock/StockMovement.tsx');
    const financialReports = source('../../payment/reports/FinancialReports.tsx');

    [stockMovement, financialReports].forEach(component => {
      expect(component).not.toContain('Ctrl+F');
      expect(component).not.toContain('Ctrl+G');
      expect(component).not.toContain('Ctrl+D');
      expect(component).toContain('<strong>Esc</strong>');
    });
  });

  it('lets an aria-modal dialog own Escape before the document flow closes', () => {
    const documentFlow = source('./GlobalDocumentFlow.tsx');
    expect(documentFlow).toContain("e.key === 'Escape' && document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]')");
    expect(documentFlow).not.toContain('Ctrl+N');
    expect(documentFlow).not.toContain('Ctrl+F');
  });
});
