import { getPurchaseOrderSubmissionBoundary } from './usePurchaseOrderSave';

describe('purchase submission boundaries', () => {
    it('routes purchase orders only through the canonical confirmed command', () => {
        const boundary = getPurchaseOrderSubmissionBoundary();

        expect(boundary).toEqual({
            operationKey: 'procurement.purchase_order.prepare',
            legacyEndpointAllowed: false,
            requiresActorConfirmation: true,
        });
    });
});
