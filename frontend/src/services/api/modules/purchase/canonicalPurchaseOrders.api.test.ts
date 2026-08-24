jest.mock('../../canonicalOperatorActions', () => ({
    prepareCanonicalAction: jest.fn(),
    approveAndExecuteCanonicalAction: jest.fn(),
    canonicalExecutionCompleted: jest.fn((execution) => execution.status === 'executed'),
}));
jest.mock('../../apiClient', () => ({
    apiHelpers: { get: jest.fn() },
}));

import { apiHelpers } from '../../apiClient';
import {
    approveAndExecuteCanonicalAction,
    canonicalExecutionCompleted,
    prepareCanonicalAction,
} from '../../canonicalOperatorActions';
import {
    canonicalPurchaseOrdersApi,
    requireCanonicalPurchaseOrderReadback,
} from './canonicalPurchaseOrders.api';

const UUID = 'd3000000-0000-7000-8000-000000000001';

const productLine = () => ({
    purchase_order_line_id: UUID,
    line_number: 1,
    line_kind: 'product',
    product_id: 'd3000000-0000-7000-8000-000000000002',
    product_name: 'Product',
    product_code: 'SKU',
    hsn_code: '481910',
    charge_code: null,
    uom_code: 'EA',
    uom_conversion_id: 'd3000000-0000-7000-8000-000000000006',
    billed_quantity: '1.000000',
    free_quantity: '0.000000',
    free_supply_tax_treatment: 'excluded_from_taxable_value',
    quoted_unit_rate: '100.0000',
    price_basis: 'tax_exclusive',
    gross_amount: '100.00',
    line_discount_amount: '0.00',
    document_discount_amount: '0.00',
    net_value_amount: '100.00',
    gst_taxable_value: '100.00',
    cgst_rate: '6.000000',
    sgst_rate: '6.000000',
    igst_rate: '0.000000',
    cess_rate: '0.000000',
    cgst_amount: '6.00',
    sgst_amount: '6.00',
    igst_amount: '0.00',
    cess_amount: '0.00',
    line_total: '112.00',
});

const readback = () => ({
    purchase_order_id: UUID,
    branch_id: 'd3000000-0000-7000-8000-000000000003',
    supplier_id: 'd3000000-0000-7000-8000-000000000004',
    supplier_name: 'Supplier',
    purchase_order_number: 'PO-1',
    order_date: '2026-08-25',
    expected_delivery_date: '2026-09-01',
    status: 'approved',
    supply_type: 'intra_state',
    currency_code: 'INR',
    subtotal: '100.00',
    discount_total: '0.00',
    charges_total: '0.00',
    net_value_total: '100.00',
    taxable_amount: '100.00',
    cgst_amount: '6.00',
    sgst_amount: '6.00',
    igst_amount: '0.00',
    cess_amount: '0.00',
    rounding_adjustment: '0.00',
    total_amount: '112.00',
    calculation_ruleset_version: 'gst-v1',
    row_version: 1,
    items: [productLine()],
});

const chargeLine = () => ({
    ...productLine(),
    purchase_order_line_id: 'd3000000-0000-7000-8000-000000000007',
    line_number: 2,
    line_kind: 'charge',
    product_id: null,
    product_name: null,
    product_code: null,
    hsn_code: null,
    charge_code: 'freight',
    uom_code: null,
    uom_conversion_id: null,
    billed_quantity: null,
    free_quantity: null,
    free_supply_tax_treatment: null,
    quoted_unit_rate: null,
    gross_amount: '10.00',
    net_value_amount: '10.00',
    gst_taxable_value: '10.00',
    cgst_amount: '0.90',
    sgst_amount: '0.90',
    line_total: '11.80',
});

describe('canonical purchase-order readback', () => {
    beforeEach(() => jest.clearAllMocks());

    it('accepts exact line/header reconciliation', () => {
        expect(requireCanonicalPurchaseOrderReadback(readback(), UUID).total_amount).toBe('112.00');
    });

    it('reconciles product and charge lines separately', () => {
        const document = {
            ...readback(),
            charges_total: '10.00',
            net_value_total: '110.00',
            taxable_amount: '110.00',
            cgst_amount: '6.90',
            sgst_amount: '6.90',
            total_amount: '123.80',
            items: [productLine(), chargeLine()],
        };
        expect(requireCanonicalPurchaseOrderReadback(document).charges_total).toBe('10.00');
    });

    it.each([
        ['subtotal', { subtotal: '99.99' }],
        ['tax total', { cgst_amount: '6.01' }],
        ['grand total', { total_amount: '111.99' }],
    ])('rejects a mismatched %s', (_label, override) => {
        expect(() => requireCanonicalPurchaseOrderReadback({ ...readback(), ...override }, UUID))
            .toThrow(/does not reconcile/);
    });

    it('rejects an incomplete product identity', () => {
        expect(() => requireCanonicalPurchaseOrderReadback({
            ...readback(),
            items: [{ ...productLine(), uom_code: null }],
        }, UUID)).toThrow(/product line 1 is incomplete/);
    });

    it('uses exact cents rather than binary floating arithmetic', () => {
        const tiny = readback();
        tiny.items = [
            { ...productLine(), gross_amount: '0.01', net_value_amount: '0.01', gst_taxable_value: '0.01', cgst_amount: '0.00', sgst_amount: '0.00', line_total: '0.01' },
            { ...productLine(), purchase_order_line_id: 'd3000000-0000-7000-8000-000000000005', line_number: 2, gross_amount: '0.02', net_value_amount: '0.02', gst_taxable_value: '0.02', cgst_amount: '0.00', sgst_amount: '0.00', line_total: '0.02' },
        ];
        Object.assign(tiny, {
            subtotal: '0.03', net_value_total: '0.03', taxable_amount: '0.03',
            cgst_amount: '0.00', sgst_amount: '0.00', total_amount: '0.03',
        });
        expect(requireCanonicalPurchaseOrderReadback(tiny).total_amount).toBe('0.03');
    });

    it('uses canonical prepare, approve, execute and dedicated detail readback only', async () => {
        const preview = {
            command_request_id: UUID,
            preview_hash: `sha256:${'a'.repeat(64)}`,
        };
        (prepareCanonicalAction as jest.Mock).mockResolvedValue({ data: preview });
        (approveAndExecuteCanonicalAction as jest.Mock).mockResolvedValue({
            approved: { data: { status: 'approved' } },
            executed: { data: { status: 'executed', resource_id: UUID } },
        });
        (canonicalExecutionCompleted as jest.Mock).mockReturnValue(true);
        (apiHelpers.get as jest.Mock).mockResolvedValue({ data: readback() });

        await canonicalPurchaseOrdersApi.prepare({ branch_id: UUID });
        const lifecycleId = 'd3000000-0000-7000-8000-000000000009';
        const result = await canonicalPurchaseOrdersApi.executePrepared(preview, lifecycleId);
        const detail = await canonicalPurchaseOrdersApi.readback(UUID);

        expect(prepareCanonicalAction).toHaveBeenCalledWith(
            'procurement.purchase_order.prepare', { branch_id: UUID },
        );
        expect(approveAndExecuteCanonicalAction).toHaveBeenCalledWith(
            'procurement.purchase_order.prepare', preview, lifecycleId,
        );
        expect(apiHelpers.get).toHaveBeenCalledWith(`/canonical/purchase-orders/${UUID}`);
        expect(result.execution.resource_id).toBe(UUID);
        expect(detail.purchase_order_number).toBe('PO-1');
    });
});
