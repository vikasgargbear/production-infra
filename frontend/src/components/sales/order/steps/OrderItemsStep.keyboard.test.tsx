import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import OrderItemsStep from './OrderItemsStep';

const mockFocusField = jest.fn();

jest.mock('../../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ hasCapability: () => true }),
}));

jest.mock('../../../global', () => {
  const ReactForMock = require('react');
  return {
    CustomerSearch: () => <input aria-label="Customer search" />,
    StandardDatePicker: ({ label }: any) => <input aria-label={label} />,
    ProductSearch: ReactForMock.forwardRef(({ onAddItem }: any, ref: any) => {
      ReactForMock.useImperativeHandle(ref, () => ({ focus: jest.fn() }));
      return <button type="button" onClick={() => onAddItem({
        product_id: 'product-1', batch_id: 'batch-1', product_name: 'Product',
      })}>Choose stocked product</button>;
    }),
    ItemsTableKeyboard: ReactForMock.forwardRef((_props: any, ref: any) => {
      ReactForMock.useImperativeHandle(ref, () => ({ focusField: mockFocusField, focusFirstField: jest.fn() }));
      return <div>Order lines</div>;
    }),
  };
});

test('hands product and batch selection to the appended sales-order quantity', async () => {
  const Wrapper = () => {
    const [order, setOrder] = useState<any>({
      items: [], order_date: '2026-08-29', expected_delivery_date: '', shipping_address_data: null,
    });
    return <OrderItemsStep
      order={order}
      setOrder={setOrder}
      maximumOrderDate="2026-08-29"
      selectedCustomer={null}
      message=""
      messageType=""
      onCustomerSelect={jest.fn()}
      onProductSelect={(product) => setOrder(previous => ({
        ...previous,
        items: [...previous.items, { id: 'line-1', ...product, quantity: '1.000000' }],
      }))}
      onUpdateItem={jest.fn()}
      onRemoveItem={jest.fn()}
      onShowCustomerModal={jest.fn()}
      onShowProductModal={jest.fn()}
      onShowImportModal={jest.fn()}
      onCreateProduct={jest.fn()}
    />;
  };

  render(<Wrapper />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose stocked product' }));
  await waitFor(() => expect(mockFocusField).toHaveBeenCalledWith(0, 'quantity'));
});
