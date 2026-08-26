import fs from 'fs';
import path from 'path';


const source = (name: string): string => fs.readFileSync(
    path.resolve(__dirname, name),
    'utf-8',
);


test.each(['InvoiceSearch.tsx', 'PurchaseSearch.tsx'])(
    '%s always resolves search results from the API',
    (name) => {
        const component = source(name);
        expect(component).not.toContain('cacheRef');
        expect(component).not.toContain('getCacheKey');
        expect(component).toContain('Amount unavailable');
    },
);


test('purchase search never invents an unpaid status', () => {
    const component = source('PurchaseSearch.tsx');
    expect(component).not.toContain("|| 'Unpaid'");
    expect(component).toContain('Status unavailable');
});


test('purchase draft identities use the secure UUID boundary', () => {
    const component = source('../../purchase/utils/productItemTransform.ts');
    expect(component).toContain('clientUuid()');
    expect(component).not.toContain('Math.random');
});
