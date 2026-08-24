import {
    buildCanonicalInvoicePreparePayload,
    canonicalInvoiceValidationError,
    companyInvoiceValidationError,
    invoicePlaceOfSupplyStateCode,
    invoicePreviewValidationError,
} from './canonicalInvoiceCommand';
import type { Invoice } from '../hooks/useInvoiceLogic';
import type { Customer } from '../../../../types/models/customer';

const ids = {
    branch: '10000000-0000-7000-8000-000000000001',
    location: '10000000-0000-7000-8000-000000000002',
    customer: '10000000-0000-7000-8000-000000000003',
    product: '10000000-0000-7000-8000-000000000004',
    batch: '10000000-0000-7000-8000-000000000005',
    uom: '10000000-0000-7000-8000-000000000006',
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
    discount_percent: 5,
    discount_amount: 0,
    freight_charges: 12.5,
    billing_address: '1 Canonical Customer Road',
    shipping_address: '1 Canonical Customer Road',
    items: [{
        product_id: ids.product,
        batch_id: ids.batch,
        uom_conversion_id: ids.uom,
        branch_id: ids.branch,
        location_id: ids.location,
        quantity: 2,
        free_quantity: 1,
        available_quantity: 10,
        unit_price: 100,
        discount_percent: 10,
        hsn_code: '481910',
        product_type: 'consumable',
    }],
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
            from_location_id: ids.location,
            place_of_supply_state_code: '27',
            logistics: { transport_mode: 'in_person', distance_km: '0' },
            document_discount: {
                document_discount_kind: 'percent',
                document_discount_basis: 'price_value',
                document_discount_value: '5',
            },
            charge_lines: [{
                charge_code: 'freight',
                quoted_amount: '12.5',
                price_basis: 'tax_exclusive',
                document_discount_eligible: false,
            }],
        }));
        expect((payload.lines as any[])[0]).toEqual(expect.objectContaining({
            product_id: ids.product,
            uom_conversion_id: ids.uom,
            fulfillment_source: 'direct_issue',
            billed_quantity: '2',
            free_quantity: '1',
            quoted_unit_rate: '100',
            batch_allocations: [{
                batch_id: ids.batch,
                billed_quantity: '2',
                free_quantity: '1',
            }],
        }));
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
            /needs 11 units but the selected batch has 10.*multi-batch allocation is not available/i,
        );
        expect(() => buildCanonicalInvoicePreparePayload(
            insufficient,
            customer,
            'erp-web-invoice:insufficient-batch',
        )).toThrow(/multi-batch allocation is not available/i);
    });

    it('fails closed for delivery until exact distance is captured', () => {
        const delivery = { ...invoice, delivery_type: 'DELIVERY' } as Invoice;
        expect(canonicalInvoiceValidationError(delivery, customer)).toMatch(
            /exact transport distance/i,
        );
    });

    it('uses the selected delivery-address state as canonical place of supply', () => {
        const alternateDelivery = {
            ...invoice,
            shipping_address: '2 Alternate Road, Bengaluru, Karnataka, 560001',
            shipping_address_data: { state: 'Karnataka' },
        } as Invoice;

        expect(invoicePlaceOfSupplyStateCode(alternateDelivery, customer)).toBe('29');
        expect(buildCanonicalInvoicePreparePayload(
            alternateDelivery,
            customer,
            'erp-web-invoice:alternate-delivery',
        )).toEqual(expect.objectContaining({ place_of_supply_state_code: '29' }));
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
        [{ ...invoice, shipping_address: 'Unsaved alternate delivery text' }, /delivery address state/i],
        [{ ...invoice, shipping_address_data: { state: 'Unknown state' } }, /delivery address state/i],
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
