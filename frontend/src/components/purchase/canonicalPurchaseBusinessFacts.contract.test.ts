import { readFileSync } from 'fs';
import { join } from 'path';

const read = (relativePath: string) => readFileSync(join(__dirname, relativePath), 'utf8');

describe('active canonical purchase desktop facts', () => {
    const activeSources = () => [
        read('../global/modals/PDFUploadModal.tsx'),
        read('PDFVerificationFlow.tsx'),
        read('modals/ProductVerificationModal.tsx'),
        read('purchase-entry/PurchaseEntryFlow.tsx'),
        read('purchase-entry/hooks/usePurchaseEntryLogic.ts'),
        read('purchase-order/hooks/usePurchaseOrderLogic.ts'),
        read('purchase-order/hooks/usePurchaseOrderSave.ts'),
        read('purchase-order/utils/canonicalPurchaseOrderCommand.ts'),
        read('ui/PurchaseItemEditModal.tsx'),
        read('utils/productItemTransform.ts'),
        read('../../services/calculations/purchaseOrderCalculationService.ts'),
    ].join('\n');

    it('contains no guessed GST, price multiplier, pack size, quantity or payment method', () => {
        const source = activeSources();
        expect(source).not.toMatch(/tax_percent\s*:\s*(?:12|18)\b/);
        expect(source).not.toMatch(/(?:gst_percent|tax_percent)[^\n]*(?:\|\||\?\?)\s*(?:12|18)\b/);
        expect(source).not.toMatch(/\*\s*0\.[579]\b/);
        expect(source).not.toMatch(/pack_size[^\n]*(?:\|\||\?\?)\s*(?:1|10)\b/);
        expect(source).not.toMatch(/packages_per_box[^\n]*(?:\|\||\?\?)\s*10\b/);
        expect(source).not.toMatch(/quantity\s*:\s*['"]?1['"]?\s*[,}]/);
        expect(source).not.toContain("method: 'cash'");
        expect(source).not.toMatch(/(?:free_quantity|discount_percent)\s*\?\?\s*0/);
    });

    it('does not synthesize batch, expiry, terms, warehouse or transport facts', () => {
        const source = activeSources();
        expect(source).not.toContain('generateBatchNumber');
        expect(source).not.toContain('Missing expiry dates default');
        expect(source).not.toContain("payment_terms: '30 days'");
        expect(source).not.toContain("delivery_terms: 'F.O.R. Destination'");
        expect(source).not.toContain("delivery_location: 'Main Warehouse'");
        expect(source).not.toContain("transport_mode: 'By Road'");
    });

    it('keeps calculation requests behind explicit line facts', () => {
        const logic = read('purchase-entry/hooks/usePurchaseEntryLogic.ts');
        expect(logic).toContain('const incompleteLine');
        expect(logic).toContain('const incompleteCharges');
        expect(logic).toContain('if (!purchaseData.supplier_id || incompleteLine || incompleteCharges)');
        expect(logic).toContain("gross_amount: '', discount_amount: '', tax_amount: '', round_off: ''");
        expect(logic).toContain('purchaseEntryDraftReadinessError');
        expect(logic).toContain('missing canonical product or UOM identity');
        expect(read('PDFVerificationFlow.tsx')).not.toMatch(/\.reduce\(|\.toFixed\(/);
        expect(read('ui/PurchaseItemEditModal.tsx')).not.toContain('calculatePurchaseItemTotal');
        expect(read('../../services/calculations/purchaseOrderCalculationService.ts')).toContain('requiredFact');
    });
});
