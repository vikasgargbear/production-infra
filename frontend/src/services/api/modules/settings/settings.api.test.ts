import {
    adaptCanonicalTax,
    adaptCanonicalUnit,
    adaptCanonicalWarehouse,
} from './settings.api';

describe('canonical master DTO adapters', () => {
    it('preserves canonical warehouse identity and operational flags', () => {
        expect(adaptCanonicalWarehouse({
            warehouse_id: '11111111-2222-4333-8444-555555555555',
            warehouse_code: 'MAIN',
            warehouse_name: 'Main Warehouse',
            warehouse_type: 'warehouse',
            branch_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            branch_name: 'Mumbai',
            allows_sale: true,
            allows_negative_stock: false,
            is_active: true,
            status: 'active',
        })).toEqual({
            id: '11111111-2222-4333-8444-555555555555',
            code: 'MAIN',
            name: 'Main Warehouse',
            type: 'warehouse',
            branchId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            branchName: 'Mumbai',
            allowsSale: true,
            allowsNegativeStock: false,
            isActive: true,
            status: 'active',
        });
    });

    it('maps canonical unit identity and precision', () => {
        expect(adaptCanonicalUnit({
            unit_id: 'BX',
            unit_code: 'BX',
            unit_name: 'Box',
            symbol: 'box',
            unit_type: 'count',
            decimal_places: 3,
            is_active: true,
            status: 'active',
        })).toMatchObject({
            id: 'BX',
            code: 'BX',
            name: 'Box',
            category: 'count',
            decimalPlaces: 3,
        });
    });

    it('maps canonical tax identity and component rates', () => {
        expect(adaptCanonicalTax({
            tax_id: '11111111-2222-4333-8444-555555555555',
            tax_code: 'GST18',
            tax_name: 'GST 18%',
            taxability: 'taxable',
            total_rate: '18.000000',
            cgst_rate: '9.000000',
            sgst_rate: '9.000000',
            igst_rate: '18.000000',
            cess_rate: '0.000000',
            effective_from: '2026-04-01',
            effective_to: null,
            is_active: true,
            status: 'active',
        })).toMatchObject({
            id: '11111111-2222-4333-8444-555555555555',
            code: 'GST18',
            name: 'GST 18%',
            type: 'taxable',
            totalRate: 18,
            cgst: 9,
            sgst: 9,
            igst: 18,
            cess: 0,
        });
    });
});
