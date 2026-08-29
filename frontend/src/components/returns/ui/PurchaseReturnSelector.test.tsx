import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import PurchaseReturnSelector from './PurchaseReturnSelector';

test('moves from search through supplier invoices with arrows and selects with Enter', () => {
  const onInvoiceSelect = jest.fn();
  render(<PurchaseReturnSelector
    invoices={[
      { supplier_invoice_id: 'invoice-1', supplier_invoice_number: 'PI-1', supplier_name: 'Supplier', invoice_date: '2026-08-01', total_amount: '10.00' },
      { supplier_invoice_id: 'invoice-2', supplier_invoice_number: 'PI-2', supplier_name: 'Supplier', invoice_date: '2026-08-02', total_amount: '20.00' },
    ]}
    onInvoiceSelect={onInvoiceSelect}
  />);

  const search = screen.getByPlaceholderText(/Search by invoice number/);
  const first = screen.getByRole('button', { name: 'Select supplier invoice PI-1' });
  const second = screen.getByRole('button', { name: 'Select supplier invoice PI-2' });
  search.focus();
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'ArrowRight' });
  expect(second).toHaveFocus();
  fireEvent.keyDown(second, { key: 'Enter' });
  expect(onInvoiceSelect).toHaveBeenCalledWith(expect.objectContaining({ supplier_invoice_id: 'invoice-2' }));
});
