import {
    buildCanonicalInvoicePreparePayload,
    canonicalInvoiceValidationError,
    companyInvoiceValidationError,
    invoicePreviewValidationError,
} from './canonicalInvoiceCommand';
import type { Invoice } from '../hooks/useInvoiceLogic';
import type { Customer } from '../../../../types/models/customer';
import { prepareImportedItemsForInvoice } from './invoiceItemUtils';
import { projectCanonicalImportLines } from '../../utils/documentImport';

const ids = {
    branch: '10000000-0000-7000-8000-000000000001',
    location: '10000000-0000-7000-8000-000000000002',
    customer: '10000000-0000-7000-8000-000000000003',
    product: '10000000-0000-7000-8000-000000000004',
    batch: '10000000-0000-7000-8000-000000000005',
    uom: '10000000-0000-7000-8000-000000000006',
    sourceLine: '10000000-0000-7000-8000-000000000007',
    command: '10000000-0000-7000-8000-000000000008',
    inventoryDocument: '10000000-0000-7000-8000-000000000009',
    inventoryLine: '10000000-0000-7000-8000-000000000010',
    dispatch: '10000000-0000-7000-8000-000000000011',
    dispatchLine: '10000000-0000-7000-8000-000000000012',
    invoiceDispatchAllocation: '10000000-0000-7000-8000-000000000013',
    deliveryAddress: '10000000-0000-7000-8000-000000000014',
};

const customer = {
    customer_id: ids.customer,
    customer_code: 'C-1',
    customer_name: 'Canonical Customer',
    customer_type: 'retail',
    primary_phone: '9000000000',
    place_of_supply_state_code: '27',
} as Customer;

const invoice = {
    invoice_date: '2026-08-24',
    delivery_type: 'PICKUP',
    discount_type: 'percentage',
    discount_percent: '5',
    discount_amount: 0,
    freight_charges: '12.5',
    billing_address: '1 Canonical Customer Road',
    shipping_address: '1 Canonical Customer Road',
    shipping_address_data: { address_id: ids.deliveryAddress, row_version: 7, state_code: '27' },
    items: [{
        product_id: ids.product,
        batch_id: ids.batch,
        uom_conversion_id: ids.uom,
        branch_id: ids.branch,
        location_id: ids.location,
        quantity: '2',
        free_quantity: '1',
        available_quantity: '10',
        unit_price: '100',
        discount_percent: '10',
        free_supply_tax_treatment: 'included_at_unit_rate',
        hsn_code: '481910',
        product_type: 'consumable',
    } as any],
} as Invoice;

const company = {
    name: 'Canonical Pharma Private Limited',
    address: '1 Canonical Seller Road',
    gst_number: '27ABCDE1234F1Z5',
} as any;

describe('canonical invoice command', () => {
    it('maps the browser invoice to the shared canonical action contract', () => {
        const payload = buildCanonicalInvoicePreparePayload(
            invoice,
            customer,
            'erp-web-invoice:test-0001',
        );

        expect(payload).toEqual(expect.objectContaining({
            idempotency_key: 'erp-web-invoice:test-0001',
            branch_id: ids.branch,
            customer_account_id: ids.customer,
            delivery_address_id: ids.deliveryAddress,
            delivery_address_row_version: '7',
            from_location_id: ids.location,
            logistics: { transport_mode: 'in_person', distance_km: '0' },
            document_discount: {
                document_discount_kind: 'percent',
                document_discount_basis: 'price_value',
                document_discount_value: '5.000000',
            },
            charge_lines: [{
                charge_code: 'freight',
                quoted_amount: '12.5000',
                price_basis: 'tax_exclusive',
                document_discount_eligible: false,
            }],
        }));
        expect((payload.lines as any[])[0]).toEqual(expect.objectContaining({
            product_id: ids.product,
            uom_conversion_id: ids.uom,
            fulfillment_source: 'direct_issue',
            billed_quantity: '2.000000',
            free_quantity: '1.000000',
            quoted_unit_rate: '100.0000',
            batch_allocations: [{
                batch_id: ids.batch,
                billed_quantity: '2.000000',
                free_quantity: '1.000000',
            }],
        }));
    });

    it.each([
        {
            label: 'direct-issue execution lineage',
            allocation: {
                source_kind: 'direct_issue',
                allocation_id: ids.inventoryLine,
                source_line_id: ids.sourceLine,
                command_request_id: ids.command,
                inventory_document_id: ids.inventoryDocument,
                inventory_document_line_id: ids.inventoryLine,
                invoice_dispatch_allocation_id: null,
                dispatch_id: null,
                dispatch_line_id: null,
                from_location_id: ids.location,
                batch_id: ids.batch,
                batch_number: 'BATCH-IMPORT',
                expiry_date: null,
                base_quantity: '3.000000',
                base_billed_quantity: '2.000000',
                base_free_quantity: '1.000000',
                billed_quantity: '2.000000',
                free_quantity: '1.000000',
            },
            expectedSource: 'direct_issue',
        },
        {
            label: 'dispatch execution lineage',
            allocation: {
                source_kind: 'dispatch_allocation',
                allocation_id: ids.invoiceDispatchAllocation,
                source_line_id: ids.dispatchLine,
                command_request_id: null,
                inventory_document_id: ids.inventoryDocument,
                inventory_document_line_id: ids.inventoryLine,
                invoice_dispatch_allocation_id: ids.invoiceDispatchAllocation,
                dispatch_id: ids.dispatch,
                dispatch_line_id: ids.dispatchLine,
                from_location_id: ids.location,
                batch_id: ids.batch,
                batch_number: 'BATCH-IMPORT',
                expiry_date: null,
                base_quantity: '30.000000',
                base_billed_quantity: '20.000000',
                base_free_quantity: '10.000000',
                billed_quantity: '2.000000',
                free_quantity: '1.000000',
            },
            expectedSource: 'dispatch_allocated',
        },
    ])('preserves $label from import projection through whole prepare', ({
        allocation,
        expectedSource,
    }) => {
        const importedItems = prepareImportedItemsForInvoice(
            projectCanonicalImportLines([{
                id: ids.sourceLine,
                product_id: ids.product,
                product_name: 'Canonical import product',
                hsn_code: '481910',
                branch_id: ids.branch,
                uom_conversion_id: ids.uom,
                quantity: '2.000000',
                free_quantity: '1.000000',
                unit_price: '100.0000',
                gst_percent: '12.000000',
                discount_percent: '0.000000',
                free_supply_tax_treatment: 'included_at_unit_rate',
                available_quantity: '3.000000',
                batch_allocations: [allocation],
            }]),
        );
        const importedInvoice = {
            ...invoice,
            discount_percent: 0,
            freight_charges: 0,
            items: importedItems,
        } as Invoice;

        const payload = buildCanonicalInvoicePreparePayload(
            importedInvoice,
            customer,
            `erp-web-invoice:import:${expectedSource}`,
        );
        const line = (payload.lines as Record<string, unknown>[])[0];
        expect(line.fulfillment_source).toBe(expectedSource);
        expect(importedItems[0]).toEqual(expect.objectContaining({
            source_allocation_kind: allocation.source_kind,
            allocation_id: allocation.allocation_id,
            inventory_document_id: ids.inventoryDocument,
            inventory_document_line_id: ids.inventoryLine,
            dispatch_line_id: allocation.dispatch_line_id,
        }));

        const isDispatch = expectedSource === 'dispatch_allocated';
        expect(payload.from_location_id).toBe(isDispatch ? undefined : ids.location);
        expect(payload.logistics).toEqual(isDispatch ? undefined : {
            transport_mode: 'in_person',
            distance_km: '0',
        });
        expect(line.batch_allocations).toEqual(isDispatch ? undefined : [{
            batch_id: ids.batch,
            billed_quantity: '2.000000',
            free_quantity: '1.000000',
        }]);
        expect(line.dispatch_allocations).toEqual(isDispatch ? [{
                dispatch_line_id: ids.dispatchLine,
                allocated_base_billed_quantity: '20.000000',
                allocated_base_free_quantity: '10.000000',
            }] : undefined);

        let editedError: Error | undefined;
        try {
            buildCanonicalInvoicePreparePayload({
                ...importedInvoice,
                items: [{ ...importedItems[0], quantity: 1 }],
            } as Invoice, customer, 'erp-web-invoice:edited-import');
        } catch (error) {
            editedError = error instanceof Error ? error : new Error(String(error));
        }
        expect(editedError?.message).toBe(isDispatch
            ? 'Item 1 dispatch quantity was edited after import. Re-import the canonical dispatch before invoicing.'
            : undefined);
    });

    it('fails closed when a canonical stock reference is missing', () => {
        const invalid = {
            ...invoice,
            items: [{ ...invoice.items[0], location_id: undefined }],
        } as Invoice;
        expect(canonicalInvoiceValidationError(invalid, customer)).toMatch(
            /stock location is missing its canonical UUID/i,
        );
    });

    it('requires a sales order to be dispatched before invoice posting', () => {
        const orderImport = {
            ...invoice,
            items: [{
                ...invoice.items[0],
                source_document_kind: 'sales_order',
                free_supply_tax_treatment: 'excluded_from_taxable_value',
            }],
        } as Invoice;

        expect(canonicalInvoiceValidationError(orderImport, customer)).toMatch(
            /order must be dispatched first.*cannot consume its stock reservation/i,
        );
        expect(() => buildCanonicalInvoicePreparePayload(
            orderImport,
            customer,
            'erp-web-invoice:blocked-order-import',
        )).toThrow(/order must be dispatched first/i);
    });

    it('fails closed instead of partially allocating beyond the selected batch', () => {
        const insufficient = {
            ...invoice,
            items: [{
                ...invoice.items[0],
                quantity: 9,
                free_quantity: 2,
                available_quantity: 10,
            }],
        } as Invoice;

        expect(canonicalInvoiceValidationError(insufficient, customer)).toMatch(
            /needs 11\.000000 units but the selected batch has 10\.000000.*multi-batch allocation is not available/i,
        );
        expect(() => buildCanonicalInvoicePreparePayload(
            insufficient,
            customer,
            'erp-web-invoice:insufficient-batch',
        )).toThrow(/multi-batch allocation is not available/i);
    });

    it.each([
        {
            label: 'free-only supply included at the quoted unit rate',
            billed: '0',
            free: '2',
            treatment: 'included_at_unit_rate' as const,
        },
        {
            label: 'free-only supply excluded from taxable value',
            billed: '0',
            free: '3',
            treatment: 'excluded_from_taxable_value' as const,
        },
        {
            label: 'mixed billed and free supply',
            billed: '4',
            free: '1',
            treatment: 'included_at_unit_rate' as const,
        },
        {
            label: 'fractional billed and free supply',
            billed: '1.25',
            free: '0.375',
            treatment: 'excluded_from_taxable_value' as const,
        },
    ])('builds the exact canonical prepare payload for $label', ({
        billed,
        free,
        treatment,
    }) => {
        const testInvoice = {
            ...invoice,
            discount_percent: 0,
            freight_charges: 0,
            items: [{
                ...invoice.items[0],
                quantity: billed,
                free_quantity: free,
                free_supply_tax_treatment: treatment,
            }],
        } as Invoice;
        const idempotencyKey = `erp-web-invoice:${treatment}:${billed}:${free}`;
        const fixed6 = (value: string) => {
            const [whole, fraction = ''] = value.split('.');
            return `${whole}.${fraction.padEnd(6, '0')}`;
        };

        expect(canonicalInvoiceValidationError(testInvoice, customer)).toBeNull();
        expect(buildCanonicalInvoicePreparePayload(
            testInvoice,
            customer,
            idempotencyKey,
        )).toEqual({
            idempotency_key: idempotencyKey,
            branch_id: ids.branch,
            invoice_date: '2026-08-24',
            document_discount: {
                document_discount_kind: 'none',
                document_discount_basis: 'price_value',
                document_discount_value: '0',
            },
            rounding_policy: 'none',
            zero_rated_payment_mode: 'not_applicable',
            customer_account_id: ids.customer,
            delivery_address_id: ids.deliveryAddress,
            delivery_address_row_version: '7',
            tax_charge_mechanism: 'normal',
            from_location_id: ids.location,
            logistics: {
                transport_mode: 'in_person',
                distance_km: '0',
            },
            lines: [{
                product_id: ids.product,
                uom_conversion_id: ids.uom,
                billed_quantity: fixed6(billed),
                free_quantity: fixed6(free),
                free_supply_tax_treatment: treatment,
                quoted_unit_rate: '100.0000',
                price_basis: 'tax_exclusive',
                line_discount: {
                    line_discount_kind: 'percent',
                    line_discount_basis: 'price_value',
                    line_discount_value: '10.000000',
                },
                document_discount_eligible: true,
                fulfillment_source: 'direct_issue',
                batch_allocations: [{
                    batch_id: ids.batch,
                    billed_quantity: fixed6(billed),
                    free_quantity: fixed6(free),
                }],
            }],
        });
    });

    it.each([
        { quantity: 0, free_quantity: 0 },
        { quantity: -1, free_quantity: 1 },
        { quantity: 1, free_quantity: Number.NaN },
    ])('rejects zero or invalid physical quantities: %p', quantities => {
        const invalid = {
            ...invoice,
            items: [{ ...invoice.items[0], ...quantities }],
        } as Invoice;

        expect(canonicalInvoiceValidationError(invalid, customer)).toMatch(
            /quantity|non-negative numbers/i,
        );
        expect(() => buildCanonicalInvoicePreparePayload(
            invalid,
            customer,
            'erp-web-invoice:invalid-quantity',
        )).toThrow(/quantity|non-negative numbers/i);
    });

    it('fails closed for delivery until exact distance is captured', () => {
        const delivery = { ...invoice, delivery_type: 'DELIVERY' } as Invoice;
        expect(canonicalInvoiceValidationError(delivery, customer)).toMatch(
            /exact transport distance/i,
        );
    });

    it('sends selected delivery-address identity and leaves place of supply to the backend', () => {
        const alternateDelivery = {
            ...invoice,
            shipping_address: '2 Alternate Road, Bengaluru, Karnataka, 560001',
            shipping_address_data: { address_id: ids.deliveryAddress, row_version: 9, state_code: '29' },
        } as Invoice;

        const payload = buildCanonicalInvoicePreparePayload(
            alternateDelivery,
            customer,
            'erp-web-invoice:alternate-delivery',
        );
        expect(payload).toEqual(expect.objectContaining({
            delivery_address_id: ids.deliveryAddress,
            delivery_address_row_version: '9',
        }));
        expect(payload).not.toHaveProperty('place_of_supply_state_code');
    });

    it.each([
        [{ ...company, name: '' }, /legal name/i],
        [{ ...company, address: '' }, /registered address/i],
        [{ ...company, gst_number: '' }, /GSTIN/i],
    ])('blocks a tax invoice when a mandatory issuer field is missing', (invalid, message) => {
        expect(companyInvoiceValidationError(invalid, invoice)).toMatch(message);
    });

    it('requires an issuer drug licence only for medicine invoices', () => {
        const medicine = {
            ...invoice,
            items: [{ ...invoice.items[0], product_type: 'medicine' }],
        } as Invoice;
        expect(companyInvoiceValidationError(company, medicine)).toMatch(/drug licence/i);
        expect(companyInvoiceValidationError(company, invoice)).toBeNull();
    });

    it.each([
        [{ ...invoice, billing_address: '' }, /billing address/i],
        [{ ...invoice, shipping_address: '' }, /delivery address/i],
        [{ ...invoice, shipping_address: 'Unsaved alternate delivery text', shipping_address_data: undefined }, /canonical UUID/i],
        [{ ...invoice, shipping_address_data: { address_id: ids.deliveryAddress } }, /row version/i],
        [{ ...invoice, items: [{ ...invoice.items[0], hsn_code: '' }] }, /HSN code/i],
    ])('blocks a canonical invoice when a mandatory document field is missing', (invalid, message) => {
        expect(canonicalInvoiceValidationError(invalid as Invoice, customer)).toMatch(message);
    });

    it('uses the same mandatory-field guard before preview and submission', () => {
        expect(invoicePreviewValidationError(
            { ...company, address: '' },
            invoice,
            customer,
        )).toMatch(/registered address/i);
        expect(invoicePreviewValidationError(
            company,
            { ...invoice, shipping_address: '' } as Invoice,
            customer,
        )).toMatch(/delivery address/i);
        expect(invoicePreviewValidationError(company, invoice, customer)).toBeNull();
    });
});
