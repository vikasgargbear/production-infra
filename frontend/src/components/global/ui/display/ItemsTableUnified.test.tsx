import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ItemsTable from './ItemsTableUnified';

test('mobile item card exposes every editable value without horizontal scrolling', () => {
  const onUpdateItem = jest.fn();

  render(
    <ItemsTable
      items={[{
        product_id: 'd3000000-0000-7000-8000-000000000015',
        batch_id: 'd3000000-0000-7000-8000-000000000016',
        product_name: 'Synthetic Carton',
        batch_number: 'BATCH-1',
        quantity: 1,
        unit_price: 150,
        mrp: 150,
        gst_percent: 12,
      }]}
      onUpdateItem={onUpdateItem}
      onRemoveItem={jest.fn()}
    />,
  );

  expect(screen.getByText('Line total ₹168.00')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Remove Synthetic Carton' })).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
  expect(onUpdateItem).toHaveBeenCalledWith(0, 'quantity', 2);
});
