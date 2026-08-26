import { fireEvent, render, screen } from '@testing-library/react';
import ChallanDetailsStep from './ChallanDetailsStep';
import type { Challan } from '../types/challanTypes';

jest.mock('../../../global', () => ({
    DocumentFooter: () => null,
    ModuleHeader: () => null,
    StandardDatePicker: () => null,
}));
jest.mock('../ui/ImportFromInvoiceModal', () => () => null);

const location = 'd3000000-0000-7000-8000-000000000006';
const line = 'd3900000-0000-7000-8000-000000000001';
const firstBatch = 'd3000000-0000-7000-8000-000000000017';
const alternateBatch = 'd3000000-0000-7000-8000-000000000018';
const batch = (batchId: string, number: string) => ({
    batch_id: batchId,
    batch_number: number,
    expiry_date: '2027-01-01',
    location_id: location,
    location_name: 'Saleable',
    mrp: '100.0000',
    available_quantity: '2.000000',
    available_base_quantity: '2.000000',
    fefo_priority: number === 'BATCH-A' ? 1 : 2,
});

const challan = {
    challan_id: 0,
    challan_number: '',
    challan_date: '2026-08-26',
    expected_delivery_date: '',
    status: 'draft',
    source_order_id: 'd3900000-0000-7000-8000-000000000003',
    customer_id: 'd3200000-0000-7000-8000-000000000001',
    customer_name: 'Customer',
    customer_details: null,
    billing_address: '', delivery_address: '', delivery_city: '', delivery_state: '', delivery_pincode: '',
    delivery_contact_person: '', delivery_contact_phone: '', distance_km: '', total_packages: 0,
    total_weight: 0, total_quantity: '1.000000', total_amount: '', notes: '', reference_doc: 'Order: SO-1',
    items: [{
        id: `${line}:${firstBatch}`,
        source_order_line_id: line,
        product_id: 'd3000000-0000-7000-8000-000000000015',
        product_name: 'Canonical Product',
        branch_id: 'd3000000-0000-7000-8000-000000000005',
        location_id: location,
        uom_conversion_id: 'd3000000-0000-7000-8000-000000000016',
        batch_id: firstBatch,
        batch_number: 'BATCH-A',
        expiry_date: '2027-01-01',
        quantity: '1.000000',
        free_quantity: '0.000000',
        base_billed_quantity: '1.000000',
        base_free_quantity: '0.000000',
        eligible_batches: [batch(firstBatch, 'BATCH-A'), batch(alternateBatch, 'BATCH-B')],
    }],
} as Challan;

test('renders an accessible same-tier batch choice and applies its canonical identity', () => {
    const setChallan = jest.fn();
    render(<ChallanDetailsStep
        challan={challan}
        setChallan={setChallan}
        selectedCustomer={null}
        employees={[]}
        selectedMR={null}
        setSelectedMR={jest.fn()}
        showCreateCustomer={false}
        setShowCreateCustomer={jest.fn()}
        showCreateProduct={false}
        setShowCreateProduct={jest.fn()}
        showImportModal={false}
        setShowImportModal={jest.fn()}
        newProductName=""
        setNewProductName={jest.fn()}
        handleCustomerSelect={jest.fn()}
        handleProductSelect={jest.fn()}
        handleImport={jest.fn()}
        updateItem={jest.fn()}
        removeItem={jest.fn()}
        challanFormRef={{ current: null }}
        itemsTableRef={{ current: null }}
        productSearchRef={{ current: null }}
        onContinue={jest.fn()}
    />);

    const choice = screen.getByRole('combobox', { name: /Batch for Canonical Product/i });
    expect(screen.getByText(/FEFO batches are selected by default/i)).toBeTruthy();
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
        expect.stringContaining('BATCH-A'),
        expect.stringContaining('BATCH-B'),
    ]);
    fireEvent.change(choice, { target: { value: alternateBatch } });
    const update = setChallan.mock.calls[0][0] as (previous: Challan) => Challan;
    expect(update(challan).items[0]).toMatchObject({
        id: `${line}:${alternateBatch}`,
        batch_id: alternateBatch,
        batch_number: 'BATCH-B',
    });
});
