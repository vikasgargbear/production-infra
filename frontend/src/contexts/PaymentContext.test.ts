import fs from 'fs';
import path from 'path';

describe('PaymentContext business-date authority', () => {
  it('leaves the payment date empty until the canonical context supplies it', () => {
    const source = fs.readFileSync(path.join(__dirname, 'PaymentContext.tsx'), 'utf8');
    expect(source).toContain("payment_date: ''");
    expect(source).not.toContain('toISOString()');
    expect(source).not.toContain('new Date(');
  });
});
