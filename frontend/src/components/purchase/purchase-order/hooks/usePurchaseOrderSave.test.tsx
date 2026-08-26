import { act, renderHook } from '@testing-library/react';

import { canonicalPurchaseOrdersApi } from '../../../../services/api/modules/purchase/canonicalPurchaseOrders.api';
import { usePurchaseOrderSave } from './usePurchaseOrderSave';
import type { PurchaseOrderData } from './usePurchaseOrderLogic';
import type { CanonicalDocumentPolicy } from '../../../../services/api/modules/org/canonicalBusinessContext.api';

jest.mock('../../../../services/api/modules/purchase/canonicalPurchaseOrders.api', () => ({
    canonicalPurchaseOrdersApi: {
        prepare: jest.fn(),
        executePrepared: jest.fn(),
        readback: jest.fn(),
    },
}));
jest.mock('react-toastify', () => ({
    toast: { error: jest.fn(), success: jest.fn() },
}));

const BRANCH_ID = 'd3000000-0000-7000-8000-000000000001';
const SUPPLIER_ID = 'd3000000-0000-7000-8000-000000000002';
const PRODUCT_ID = 'd3000000-0000-7000-8000-000000000003';
const UOM_ID = 'd3000000-0000-7000-8000-000000000004';
const LINE_ID = 'd3000000-0000-7000-8000-000000000005';
const COMMAND_ID = 'd3000000-0000-7000-8000-000000000006';
const PURCHASE_ORDER_ID = 'd3000000-0000-7000-8000-000000000007';
const documentPolicy: CanonicalDocumentPolicy = {
    allowed_rounding_policies: ['none'], default_rounding_policy: 'none',
    allowed_zero_rated_payment_modes: ['not_applicable', 'with_igst'], default_zero_rated_payment_mode: 'not_applicable',
    allowed_tax_charge_mechanisms: ['normal'], default_tax_charge_mechanism: 'normal',
    allowed_price_bases: ['tax_exclusive'], default_price_basis: 'tax_exclusive',
    logistics_modes: [{ transport_mode: 'in_person', display_name: 'In person', requires_transporter_party: false, requires_vehicle: false, requires_transport_document: false }],
    default_transport_mode: 'in_person',
};

const purchaseOrder: PurchaseOrderData = {
    po_no: '', po_date: '2026-08-25', expected_delivery_date: '2026-09-01',
    supplier_id: SUPPLIER_ID, supplier_name: 'Supplier', supplier_details: {},
    items: [{
        id: LINE_ID, product_id: PRODUCT_ID, product_name: 'Product',
        uom_conversion_id: UOM_ID, quantity: 1, free_quantity: 0,
        unit_price: 100, tax_percent: 12, discount_percent: 0,
    }],
    payment_terms: '', delivery_terms: '', delivery_location: '', transport_mode: '',
    gross_amount: 0, discount_amount: 0, tax_amount: 0, freight_charges: 0,
    net_amount: 0, total_amount: 0, notes: '', status: 'draft',
};

describe('usePurchaseOrderSave terminal retry boundary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(window, 'confirm');
        (canonicalPurchaseOrdersApi.prepare as jest.Mock).mockResolvedValue({ data: {
            command_request_id: COMMAND_ID,
            command_type: 'procurement.purchase_order.approve',
            preview_hash: `sha256:${'a'.repeat(64)}`,
            financial_impact: [{ supplier_commitment: '112.00' }],
            tax_impact: [{ cgst_total: '6.00', sgst_total: '6.00', igst_total: '0.00', cess_total: '0.00' }],
            policy_warnings: [],
        } });
        (canonicalPurchaseOrdersApi.executePrepared as jest.Mock).mockResolvedValue({
            execution: { status: 'succeeded', resource_id: PURCHASE_ORDER_ID },
        });
        (canonicalPurchaseOrdersApi.readback as jest.Mock)
            .mockRejectedValueOnce(new Error('detail temporarily unavailable'))
            .mockResolvedValueOnce({
                purchase_order_id: PURCHASE_ORDER_ID,
                branch_id: BRANCH_ID,
                supplier_id: SUPPLIER_ID,
                supplier_name: 'Supplier',
                purchase_order_number: 'PO-1',
                subtotal: '100.00', discount_total: '0.00', charges_total: '0.00',
                cgst_amount: '6.00', sgst_amount: '6.00', igst_amount: '0.00', cess_amount: '0.00',
                total_amount: '112.00', status: 'approved',
            });
    });

    afterEach(() => jest.restoreAllMocks());

    it('retries readback only after execute returned a purchase-order identity', async () => {
        const setters = {
            setPurchaseOrder: jest.fn(), setCreatedPOData: jest.fn(),
            setShowSuccessModal: jest.fn(), setErrors: jest.fn(),
        };
        const { result } = renderHook(() => usePurchaseOrderSave({
            purchaseOrder,
            selectedSupplier: { supplier_id: SUPPLIER_ID, supplier_name: 'Supplier' },
            branchId: BRANCH_ID,
            isOnline: true,
            documentPolicy,
            ...setters,
        }));

        await act(async () => { expect(await result.current.prepareForReview()).toBe(true); });
        await act(async () => { await result.current.handleSavePurchaseOrder(); });
        expect(result.current.executedResourceId).toBe(PURCHASE_ORDER_ID);
        await act(async () => { await result.current.handleSavePurchaseOrder(); });

        expect(canonicalPurchaseOrdersApi.executePrepared).toHaveBeenCalledTimes(1);
        expect(canonicalPurchaseOrdersApi.readback).toHaveBeenCalledTimes(2);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(setters.setCreatedPOData).toHaveBeenCalledWith(expect.objectContaining({
            totalAmount: '112.00',
        }));
        expect(setters.setShowSuccessModal).toHaveBeenCalledWith(true);
    });
});
