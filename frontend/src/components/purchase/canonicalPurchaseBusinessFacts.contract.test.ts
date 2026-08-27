import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const read = (relativePath: string) => readFileSync(join(__dirname, relativePath), 'utf8');

describe('active canonical purchase desktop facts', () => {
    const activeSources = () => [
        read('../global/modals/PDFUploadModal.tsx'),
        read('PDFVerificationFlow.tsx'),
        read('modals/ProductVerificationModal.tsx'),
        read('purchase-entry/CanonicalPurchaseWorkflow.tsx'),
        read('purchase-entry/CanonicalSupplierInvoiceFlow.tsx'),
        read('purchase-order/hooks/usePurchaseOrderLogic.ts'),
        read('purchase-order/hooks/usePurchaseOrderSave.ts'),
        read('purchase-order/utils/canonicalPurchaseOrderCommand.ts'),
        read('grn/canonicalReceiptCommand.ts'),
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

    it('keeps calculation requests behind explicit canonical evidence', () => {
        const supplierInvoice = read('purchase-entry/CanonicalSupplierInvoiceFlow.tsx');
        expect(supplierInvoice).toContain('Load canonical GRN and GSTR-2B context first.');
        expect(supplierInvoice).toContain("prepareCanonicalAction(\n        'procurement.supplier_invoice.prepare'");
        expect(supplierInvoice).toContain('validateCanonicalSupplierInvoicePreview');
        expect(read('PDFVerificationFlow.tsx')).not.toMatch(/\.reduce\(|\.toFixed\(/);
        expect(read('ui/PurchaseItemEditModal.tsx')).not.toContain('calculatePurchaseItemTotal');
        expect(read('../../services/calculations/purchaseOrderCalculationService.ts')).toContain('requiredFact');
    });

    it('retires browser tax catalogs and legacy purchase editors', () => {
        expect(existsSync(join(__dirname, '../../config/gstRates.ts'))).toBe(false);
        expect(existsSync(join(__dirname, 'modals/PDFUploadModal.tsx'))).toBe(false);
        expect(existsSync(join(__dirname, 'ui/PurchaseHeader.tsx'))).toBe(false);
        expect(existsSync(join(__dirname, '../../config/purchase.config.ts'))).toBe(false);
        expect(existsSync(join(__dirname, '../../utils/purchaseValidation.ts'))).toBe(false);
        expect(read('../../utils/purchaseUploadValidation.ts')).toContain('backend repeats byte-size and magic-byte checks');
        expect(read('../../config/constants.ts')).not.toContain('MIN_ORDER_AMOUNT');
    });

    it('uses one canonical GST fact and never turns missing API money into zero', () => {
        const source = activeSources();
        expect(source).not.toMatch(/tax_percent\s*\?\?\s*[^,\n]*gst_percent/);
        expect(source).not.toMatch(/gst_percent\s*\?\?\s*[^,\n]*tax_percent/);
        expect(source).not.toMatch(/(?:tax_percent|gst_percent)\s*\?\?\s*[^,\n]*tax_rate/);
        expect(source).not.toMatch(/(?:taxable_amount|tax_amount|total_amount)\s*\|\|\s*0/);
        expect(read('../../services/api/modules/purchase/calculations.api.ts')).not.toMatch(/gst_percent\??:/);
        expect(read('purchase-order/hooks/usePurchaseOrderLogic.ts')).not.toMatch(/gst_percent\??:/);
        expect(read('../../services/calculations/purchaseOrderCalculationService.ts')).not.toContain("gst_type: order.gst_type || 'CGST/SGST'");
        expect(source).not.toMatch(/supplier_id\s*\?\?\s*[^,\n]*\.id\b/);
        expect(source).not.toMatch(/product_id\s*(?:\|\||\?\?)\s*[^,\n]*\.id\b/);
    });

    it('takes purchase-order commercial policy from authenticated server context', () => {
        const command = read('purchase-order/utils/canonicalPurchaseOrderCommand.ts');
        expect(command).toContain('policy.default_tax_charge_mechanism');
        expect(command).toContain('policy.default_rounding_policy');
        expect(command).toContain('policy.default_zero_rated_payment_mode');
        expect(command).toContain('policy.default_price_basis');
        expect(command).not.toContain("tax_charge_mechanism: 'normal'");
        expect(command).not.toContain("rounding_policy: 'none'");
        expect(command).not.toContain("zero_rated_payment_mode: 'not_applicable'");
        expect(command).not.toContain("price_basis: 'tax_exclusive'");
    });

    it('does not use the browser clock for purchase business policy', () => {
        const source = activeSources();
        expect(source).not.toMatch(/(?:minDate|maxDate)=\{new Date\(\)\}/);
        expect(source).not.toMatch(/Date\.now\(\)\s*\+\s*90/);
        expect(read('grn/canonicalReceiptCommand.ts')).not.toContain('now = new Date()');
        expect(read('grn/canonicalReceiptCommand.ts')).not.toContain('cannot be in the future');
    });

    it('does not advertise writes that only load a draft', () => {
        expect(read('PDFVerificationFlow.tsx')).toContain('Confirm & Load Draft');
        expect(read('PDFVerificationFlow.tsx')).not.toContain('Confirm & Save Purchase');
        expect(read('purchase-entry/CanonicalPurchaseWorkflow.tsx')).not.toContain('Save Purchase');
        expect(existsSync(join(__dirname, 'purchase-entry/PurchaseEntryFlow.tsx'))).toBe(false);
    });

    it('binds the purchase-order branch to an operation-specific accessible name', () => {
        const flow = read('purchase-order/PurchaseOrderFlow.tsx');
        const template = JSON.parse(read('../../../e2e/live18/templates/purchase_order.json'));
        expect(flow).toContain('aria-label="Purchase order branch"');
        expect(template.steps.prepare_steps[1]).toEqual(expect.objectContaining({
            action: 'select',
            locator: { kind: 'label', name: 'Purchase order branch', exact: true },
            value: '{{fact.identity.branch_id}}',
        }));
    });
});
