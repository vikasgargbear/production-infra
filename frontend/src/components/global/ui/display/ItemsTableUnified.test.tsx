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
  expect(screen.getByLabelText('Fractional Carton quantity')).toBe(desktopQuantity);
  expect(screen.getByLabelText('Fractional Carton rate')).toBe(desktopInputs[1]);
  expect(screen.getByLabelText('Fractional Carton discount percent')).toBe(desktopInputs[2]);
  expect(screen.getByLabelText('Fractional Carton free quantity')).toBe(desktopFreeQuantity);

  fireEvent.focus(desktopQuantity);
  fireEvent.change(desktopQuantity, { target: { value: '0.375001' } });
  fireEvent.keyDown(desktopQuantity, { key: 'Enter' });
  expect(onUpdateItem).toHaveBeenCalledWith(0, 'quantity', 0.375001);

  fireEvent.focus(desktopFreeQuantity);
  fireEvent.change(desktopFreeQuantity, { target: { value: '0.125001' } });
  fireEvent.keyDown(desktopFreeQuantity, { key: 'Enter' });
  expect(onUpdateItem).toHaveBeenCalledWith(0, 'free_quantity', 0.125001);
});

test('rejects seven-decimal quantities without changing displayed or stored values', () => {
  const onUpdateItem = jest.fn();
  render(
    <ItemsTable
      items={[{
        product_id: 'd3000000-0000-7000-8000-000000000015',
        batch_id: 'd3000000-0000-7000-8000-000000000016',
        product_name: 'Precision Carton',
        batch_number: 'BATCH-PRECISION',
        quantity: 0.5,
        free_quantity: 0,
        unit_price: 150,
      }]}
      onUpdateItem={onUpdateItem}
      onRemoveItem={jest.fn()}
    />,
  );

  const mobileQuantity = screen.getByLabelText('Quantity') as HTMLInputElement;
  const mobileFreeQuantity = screen.getByLabelText('Free quantity') as HTMLInputElement;
  expect(mobileFreeQuantity.value).toBe('0');

  fireEvent.change(mobileQuantity, { target: { value: '0.1234567' } });
  expect(mobileQuantity.value).toBe('0.5');
  expect(mobileQuantity.getAttribute('aria-invalid')).toBe('true');
  expect(onUpdateItem).not.toHaveBeenCalled();
  expect(screen.getByText('Quantity supports up to 6 decimal places.')).toBeTruthy();

  fireEvent.change(mobileQuantity, { target: { value: '0.123456' } });
  expect(onUpdateItem).toHaveBeenCalledWith(0, 'quantity', 0.123456);

  onUpdateItem.mockClear();
  fireEvent.change(mobileFreeQuantity, { target: { value: '0.0000001' } });
  expect(mobileFreeQuantity.value).toBe('0');
  expect(onUpdateItem).not.toHaveBeenCalled();

  onUpdateItem.mockClear();
  const desktopInputs = screen.getAllByRole('textbox') as HTMLInputElement[];
  const desktopQuantity = desktopInputs[0];
  const desktopFreeQuantity = desktopInputs[3];
  expect(desktopFreeQuantity.value).toBe('0');

  fireEvent.focus(desktopQuantity);
  fireEvent.change(desktopQuantity, { target: { value: '0.7654321' } });
  expect(desktopQuantity.value).toBe('0.5');
  expect(desktopQuantity.getAttribute('aria-invalid')).toBe('true');
  expect(onUpdateItem).not.toHaveBeenCalled();

  fireEvent.change(desktopQuantity, { target: { value: '0.765432' } });
  fireEvent.keyDown(desktopQuantity, { key: 'Enter' });
  expect(onUpdateItem).toHaveBeenCalledWith(0, 'quantity', 0.765432);

  onUpdateItem.mockClear();
  fireEvent.focus(desktopFreeQuantity);
  fireEvent.change(desktopFreeQuantity, { target: { value: '0.0000001' } });
  expect(desktopFreeQuantity.value).toBe('0');
  expect(onUpdateItem).not.toHaveBeenCalled();
});

test('exact-decimal mode preserves canonical input strings while default mode stays numeric', () => {
  const exactUpdate = jest.fn();
  const item = {
    product_id: 'd3000000-0000-7000-8000-000000000015',
    batch_id: 'd3000000-0000-7000-8000-000000000016',
    product_name: 'Exact Carton',
    batch_number: 'BATCH-EXACT',
    quantity: '900719925474.123456',
    free_quantity: '0.000001',
    unit_price: '9007199254740993.01',
    discount_percent: '0.10',
  };
  const { unmount } = render(
    <ItemsTable
      items={[item]}
      onUpdateItem={exactUpdate}
      onRemoveItem={jest.fn()}
      preserveExactDecimals
    />,
  );

  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '0.123456' } });
  fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '9007199254740993.02' } });
  fireEvent.change(screen.getByLabelText('Discount %'), { target: { value: '0.20' } });
  expect(exactUpdate).toHaveBeenCalledWith(0, 'quantity', '0.123456');
  expect(exactUpdate).toHaveBeenCalledWith(0, 'unit_price', '9007199254740993.02');
  expect(exactUpdate).toHaveBeenCalledWith(0, 'discount_percent', '0.20');
  unmount();

  const defaultUpdate = jest.fn();
  render(
    <ItemsTable
      items={[{ ...item, quantity: 1, unit_price: 10, discount_percent: 0 }]}
      onUpdateItem={defaultUpdate}
      onRemoveItem={jest.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
  expect(defaultUpdate).toHaveBeenCalledWith(0, 'quantity', 2);
});
