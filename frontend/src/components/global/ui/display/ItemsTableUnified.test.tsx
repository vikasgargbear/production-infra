import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  expect(screen.getAllByRole('button', { name: 'Remove Synthetic Carton' })).toHaveLength(2);

  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
  expect(onUpdateItem).toHaveBeenCalledWith(0, 'quantity', 2);
});

test('groups line money in the Indian system with exactly two decimals', () => {
  render(
    <ItemsTable
      items={[{
        product_name: 'High Value Carton',
        quantity: 1,
        unit_price: 1234567,
        mrp: 1234567,
        gst_percent: 0,
      }]}
      onUpdateItem={jest.fn()}
    />,
  );

  expect(screen.getAllByText('MRP ₹12,34,567.00')).toHaveLength(2);
  expect(screen.getAllByText('Line total ₹12,34,567.00')).toHaveLength(1);
  ['Quantity', 'Rate', 'Discount %', 'Free quantity'].forEach(label => {
    expect(screen.getByLabelText(label).className.split(/\s+/)).toContain('text-right');
  });
});

test('Enter follows quantity, rate, discount, free quantity, then returns to product search', async () => {
  const focusProductSearch = jest.fn();
  render(
    <ItemsTable
      items={[{
        product_name: 'Keyboard Carton',
        quantity: '1.00',
        unit_price: '100.00',
        discount_percent: '0.00',
        free_quantity: '0.00',
      }]}
      onUpdateItem={jest.fn()}
      productSearchRef={{ current: { focus: focusProductSearch } } as any}
      preserveExactDecimals
      quantityDecimalPlaces={2}
    />,
  );

  const quantity = screen.getByLabelText('Keyboard Carton quantity');
  const rate = screen.getByLabelText('Keyboard Carton rate');
  const discount = screen.getByLabelText('Keyboard Carton discount percent');
  const free = screen.getByLabelText('Keyboard Carton free quantity');

  fireEvent.keyDown(quantity, { key: 'Enter' });
  await waitFor(() => expect(rate).toHaveFocus());
  fireEvent.keyDown(rate, { key: 'Enter' });
  await waitFor(() => expect(discount).toHaveFocus());
  fireEvent.keyDown(discount, { key: 'Enter' });
  await waitFor(() => expect(free).toHaveFocus());
  fireEvent.keyDown(free, { key: 'Enter' });
  await waitFor(() => expect(focusProductSearch).toHaveBeenCalledTimes(1));
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

test('desktop numeric editors commit each blur exactly once', () => {
  const onUpdateItem = jest.fn();
  render(
    <ItemsTable
      items={[{
        product_id: 'd3000000-0000-7000-8000-000000000015',
        batch_id: 'd3000000-0000-7000-8000-000000000016',
        product_name: 'Canonical Carton',
        batch_number: 'BATCH-EXACT',
        quantity: '1.000000',
        unit_price: '84.1200',
        discount_percent: '0.000000',
      }]}
      onUpdateItem={onUpdateItem}
      preserveExactDecimals
    />,
  );

  const rate = screen.getByLabelText('Canonical Carton rate');
  fireEvent.focus(rate);
  fireEvent.change(rate, { target: { value: '85.2500' } });
  fireEvent.blur(rate);

  expect(onUpdateItem).toHaveBeenCalledTimes(1);
  expect(onUpdateItem).toHaveBeenCalledWith(0, 'unit_price', '85.2500');
});

test('commercial inputs reject more than two meaningful decimal places', () => {
  const onUpdateItem = jest.fn();
  render(
    <ItemsTable
      items={[{
        product_name: 'Reviewed Carton',
        quantity: '1.000000',
        unit_price: '84.12',
        discount_percent: '1.25',
      }]}
      onUpdateItem={onUpdateItem}
      preserveExactDecimals
    />,
  );

  fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '84.125' } });
  expect(screen.getByText('Rate supports up to 2 decimal places.')).toBeTruthy();
  expect(onUpdateItem).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Discount %'), { target: { value: '1.255' } });
  expect(screen.getByText('Discount supports up to 2 decimal places.')).toBeTruthy();
  expect(onUpdateItem).not.toHaveBeenCalled();

  const desktopRate = screen.getByLabelText('Reviewed Carton rate');
  fireEvent.focus(desktopRate);
  fireEvent.change(desktopRate, { target: { value: '84.125' } });
  expect(desktopRate.getAttribute('aria-invalid')).toBe('true');
});

test('invoice operator mode limits billed and free entry to two decimals without changing exact storage mode', () => {
  const onUpdateItem = jest.fn();
  render(
    <ItemsTable
      items={[{
        product_name: 'Operator Carton',
        quantity: '1.00',
        free_quantity: '0.00',
        unit_price: '84.12',
      }]}
      onUpdateItem={onUpdateItem}
      preserveExactDecimals
      quantityDecimalPlaces={2}
    />,
  );

  const mobileQuantity = screen.getByLabelText('Quantity') as HTMLInputElement;
  expect(mobileQuantity.step).toBe('0.01');
  fireEvent.change(mobileQuantity, { target: { value: '1.125' } });
  expect(screen.getByText('Quantity supports up to 2 decimal places.')).toBeTruthy();
  expect(onUpdateItem).not.toHaveBeenCalled();

  fireEvent.change(mobileQuantity, { target: { value: '1.25' } });
  expect(onUpdateItem).toHaveBeenCalledWith(0, 'quantity', '1.25');
});

test('requires an explicit free-supply treatment only when free quantity is positive', async () => {
  const onUpdateItem = jest.fn();
  const { rerender } = render(
    <ItemsTable
      items={[{
        product_name: 'Reviewed Carton',
        quantity: '1.000000',
        free_quantity: '0.000000',
        unit_price: '10.0000',
        free_supply_tax_treatment: 'excluded_from_taxable_value',
      }]}
      onUpdateItem={onUpdateItem}
      showFreeSupplyTaxTreatment
      preserveExactDecimals
    />,
  );

  expect(screen.queryByLabelText('Reviewed Carton free units value')).toBeNull();

  rerender(
    <ItemsTable
      items={[{
        product_name: 'Reviewed Carton',
        quantity: '1.000000',
        free_quantity: '0.250000',
        unit_price: '10.0000',
      }]}
      onUpdateItem={onUpdateItem}
      showFreeSupplyTaxTreatment
      preserveExactDecimals
    />,
  );
  const positiveTreatment = screen.getAllByLabelText(
    'Reviewed Carton free units billing',
  ) as HTMLSelectElement[];
  expect(positiveTreatment.every(select => !select.disabled)).toBe(true);
  expect(positiveTreatment[0].value).toBe('');
  expect(screen.getByText('Product / batch')).toBeTruthy();
  expect(screen.getByText('Free qty / billing')).toBeTruthy();
  expect(screen.queryByText('Free tax treatment')).toBeNull();
  expect(screen.getAllByText('Choose how free units are billed')).toHaveLength(2);
  expect(screen.getAllByText('Free — do not charge')).toHaveLength(2);
  expect(screen.getAllByText('Charge at item rate')).toHaveLength(2);
  fireEvent.keyDown(screen.getByLabelText('Reviewed Carton free quantity'), { key: 'Enter' });
  await waitFor(() => expect(
    screen.getByTestId('desktop-free-supply-treatment-0'),
  ).toHaveFocus());
  fireEvent.change(positiveTreatment[0], {
    target: { value: 'included_at_unit_rate' },
  });
  expect(onUpdateItem).toHaveBeenCalledWith(
    0,
    'free_supply_tax_treatment',
    'included_at_unit_rate',
  );
});
