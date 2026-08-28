import {
    buildCanonicalPurchaseOrderPreparePayload,
    canonicalPurchaseOrderReview,
    canonicalPurchaseOrderValidationError,
} from './canonicalPurchaseOrderCommand';
import { getInitialPurchaseOrder } from '../hooks/usePurchaseOrderLogic';
import type { CanonicalDocumentPolicy } from '../../../../services/api/modules/org/canonicalBusinessContext.api';

const policy: CanonicalDocumentPolicy = {
    allowed_rounding_policies: ['none'], default_rounding_policy: 'none',
    allowed_zero_rated_payment_modes: ['not_applicable', 'with_igst'], default_zero_rated_payment_mode: 'not_applicable',
    allowed_tax_charge_mechanisms: ['normal'], default_tax_charge_mechanism: 'normal',
    allowed_price_bases: ['tax_exclusive'], default_price_basis: 'tax_exclusive',
    logistics_modes: [{ transport_mode: 'in_person', display_name: 'In person', requires_transporter_party: false, requires_vehicle: false, requires_transport_document: false }],
    default_transport_mode: 'in_person',
};

const BRANCH = 'd3000000-0000-7000-8000-000000000002';
const SUPPLIER = 'd3000000-0000-7000-8000-000000000003';
const PRODUCT = 'd3000000-0000-7000-8000-000000000004';
const UOM = 'd3000000-0000-7000-8000-000000000005';

const order = () => ({
    ...getInitialPurchaseOrder(),
    po_date: '2026-08-25',
    expected_delivery_date: '2026-09-01',
    supplier_id: SUPPLIER,
    supplier_name: 'Canonical Supplier',
    discount_amount: '2.00',
    freight_charges: '0.00',
    items: [{
        id: PRODUCT,
        product_id: PRODUCT,
        product_name: 'Canonical product',
        uom_conversion_id: UOM,
        quantity: '1.5',
        free_quantity: '0.25',
        unit: 'EA',
        unit_price: '100.25',
        tax_percent: '12',
        discount_percent: '1.25',
        free_supply_tax_treatment: 'included_at_unit_rate' as const,
    }],
});

const supplier = { supplier_id: SUPPLIER, supplier_name: 'Canonical Supplier' };

describe('canonical purchase-order command', () => {
    it('builds UUID-first exact payload without browser GST or pack defaults', () => {
        const payload = buildCanonicalPurchaseOrderPreparePayload(
            order(), supplier, BRANCH, 'erp-web-purchase-order:test', policy,
        ) as any;

        expect(payload).toMatchObject({
            branch_id: BRANCH,
            supplier_account_id: SUPPLIER,
            order_date: '2026-08-25',
            expected_on: '2026-09-01',
            tax_charge_mechanism: 'normal',
            rounding_policy: 'none',
            lines: [{
                product_id: PRODUCT,
                uom_conversion_id: UOM,
                billed_quantity: '1.5',
                free_quantity: '0.25',
                free_supply_tax_treatment: 'included_at_unit_rate',
                quoted_unit_rate: '100.25',
            }],
        });
        expect(payload.lines[0]).not.toHaveProperty('gst_percent');
        expect(payload.lines[0]).not.toHaveProperty('pack_size');
        expect(payload.lines[0]).not.toHaveProperty('line_id');
    });

    it.each([
        ['branch UUID', null, supplier, BRANCH, 'Purchase-order branch'],
        ['UOM UUID', { uom_conversion_id: undefined }, supplier, BRANCH, 'UOM'],
        ['positive rate', { unit_price: '0' }, supplier, BRANCH, 'greater than zero'],
        ['free quantity', { free_quantity: undefined }, supplier, BRANCH, 'free quantity'],
        ['discount', { discount_percent: undefined }, supplier, BRANCH, 'discount'],
        ['quantity precision', { quantity: '0.1234567' }, supplier, BRANCH, 'precision'],
    ])('fails closed when %s is unavailable', (_name, itemOverride, selected, branch, message) => {
        const candidate = order();
        if (itemOverride) candidate.items[0] = { ...candidate.items[0], ...itemOverride };
        expect(canonicalPurchaseOrderValidationError(
            candidate,
            selected,
            _name === 'branch UUID' ? undefined : branch,
        )).toContain(message);
    });

    it('fails closed for an unmodelled freight charge identity', () => {
        expect(canonicalPurchaseOrderValidationError(
            { ...order(), freight_charges: '5.00' }, supplier, BRANCH,
        )).toContain('canonical charge-line identity');
    });

    it('requires an explicit zero when no freight applies', () => {
        expect(canonicalPurchaseOrderValidationError(
            { ...order(), freight_charges: '' }, supplier, BRANCH,
        )).toContain('freight');
    });

    it('parses exact backend impacts in minor units', () => {
        const review = canonicalPurchaseOrderReview({
            command_request_id: BRANCH,
            preview_hash: `sha256:${'a'.repeat(64)}`,
            command_type: 'procurement.purchase_order.approve',
            financial_impact: [{ supplier_commitment: '118.02' }],
            tax_impact: [{
                cgst_total: '9.01', sgst_total: '9.01',
                igst_total: '0', cess_total: '0',
            }],
            policy_warnings: [],
        }, BRANCH, SUPPLIER);
        expect(review.supplierCommitment).toBe('118.02');
        expect(review.gstTotal).toBe('18.02');
    });

    it('preserves values beyond JavaScript safe integers and adds tax without drift', () => {
        const review = canonicalPurchaseOrderReview({
            command_request_id: BRANCH,
            preview_hash: `sha256:${'b'.repeat(64)}`,
            command_type: 'procurement.purchase_order.approve',
            financial_impact: [{ supplier_commitment: '9007199254740993.31' }],
            tax_impact: [{
                cgst_total: '0.10', sgst_total: '0.20',
                igst_total: '0', cess_total: '0',
            }],
            policy_warnings: [],
        }, BRANCH, SUPPLIER);
        expect(review.supplierCommitment).toBe('9007199254740993.31');
        expect(review.gstTotal).toBe('0.30');
    });

    it('preserves six-place quantities and rejects inexact JavaScript fractions', () => {
        const exact = order();
        exact.items[0].quantity = '0.123456';
        const payload = buildCanonicalPurchaseOrderPreparePayload(
            exact, supplier, BRANCH, 'erp-web-purchase-order:exact', policy,
        ) as any;
        expect(payload.lines[0].billed_quantity).toBe('0.123456');

        const inexact = order();
        inexact.items[0].quantity = 0.1;
        expect(canonicalPurchaseOrderValidationError(inexact, supplier, BRANCH))
            .toContain('exact decimal string');
    });

    it('does not invent business dates in the browser', () => {
        const empty = getInitialPurchaseOrder();
        expect(empty.po_date).toBe('');
        expect(empty.expected_delivery_date).toBe('');
        expect(empty.discount_amount).toBe('');
        expect(empty.freight_charges).toBe('');
        expect(empty.gross_amount).toBe('');
        expect(empty.tax_amount).toBe('');
        expect(empty.total_amount).toBe('');
        expect(empty.payment_terms).toBe('');
        expect(empty.delivery_terms).toBe('');
        expect(empty.delivery_location).toBe('');
        expect(empty.transport_mode).toBe('');

        const authoritative = getInitialPurchaseOrder({
            po_date: '2026-08-25',
            expected_delivery_date: '2026-09-01',
        });
        expect(authoritative.po_date).toBe('2026-08-25');
        expect(authoritative.expected_delivery_date).toBe('2026-09-01');
    });
});
