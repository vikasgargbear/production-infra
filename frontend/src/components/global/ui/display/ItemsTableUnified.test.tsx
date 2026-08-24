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

test('fractional billed and free quantities remain visible and editable at canonical precision', () => {
  const onUpdateItem = jest.fn();
  render(
    <ItemsTable
      items={[{
        product_id: 'd3000000-0000-7000-8000-000000000015',
        batch_id: 'd3000000-0000-7000-8000-000000000016',
        product_name: 'Fractional Carton',
        batch_number: 'BATCH-FRACTIONAL',
        quantity: 0.5,
        free_quantity: 0.25,
        unit_price: 150,
        mrp: 150,
        gst_percent: 12,
      }]}
      onUpdateItem={onUpdateItem}
      onRemoveItem={jest.fn()}
    />,
  );

  const mobileQuantity = screen.getByLabelText('Quantity') as HTMLInputElement;
  const mobileFreeQuantity = screen.getByLabelText('Free quantity') as HTMLInputElement;
  expect(mobileQuantity.value).toBe('0.5');
  expect(mobileQuantity.step).toBe('0.000001');
  expect(mobileFreeQuantity.value).toBe('0.25');
  expect(mobileFreeQuantity.step).toBe('0.000001');

  const desktopInputs = screen.getAllByRole('textbox') as HTMLInputElement[];
  const desktopQuantity = desktopInputs[0];
  const desktopFreeQuantity = desktopInputs[3];
  expect(desktopQuantity.value).toBe('0.5');
  expect(desktopFreeQuantity.value).toBe('0.25');

  fireEvent.focus(desktopQuantity);
  fireEvent.change(desktopQuantity, { target: { value: '0.375001' } });
  fireEvent.keyDown(desktopQuantity, { key: 'Enter' });
  expect(onUpdateItem).toHaveBeenCalledWith(0, 'quantity', 0.375001);

  fireEvent.focus(desktopFreeQuantity);
  fireEvent.change(desktopFreeQuantity, { target: { value: '0.125001' } });
  fireEvent.keyDown(desktopFreeQuantity, { key: 'Enter' });
  expect(onUpdateItem).toHaveBeenCalledWith(0, 'free_quantity', 0.125001);
});
