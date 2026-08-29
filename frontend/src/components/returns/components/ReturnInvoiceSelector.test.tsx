import React, { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { invoicesApi } from '../../../services/api';
import { ReturnInvoiceSelector } from './ReturnInvoiceSelector';

jest.mock('../../../services/api', () => ({
  invoicesApi: { search: jest.fn() },
}));

test('exposes the first posted invoice and moves across invoice cards with arrows', async () => {
  (invoicesApi.search as jest.Mock).mockResolvedValue({ data: { total: 2, invoices: [
    { id: 'invoice-1', invoice_number: 'SI-1', invoice_date: '2026-08-01', final_amount: '10.00' },
    { id: 'invoice-2', invoice_number: 'SI-2', invoice_date: '2026-08-02', final_amount: '20.00' },
  ] } });
  const invoiceSearchRef = createRef<HTMLButtonElement>();
  const onInvoiceSelect = jest.fn();
  render(<ReturnInvoiceSelector
    selectedCustomer={{ customer_id: 'customer-1' } as any}
    selectedInvoice={null}
    onInvoiceSelect={onInvoiceSelect}
    showInvoiceSection
    invoiceSearchRef={invoiceSearchRef}
  />);

  const first = await screen.findByTestId('select-sales-invoice-invoice-1');
  const second = screen.getByTestId('select-sales-invoice-invoice-2');
  await waitFor(() => expect(invoiceSearchRef.current).toBe(first));
  fireEvent.focus(first);
  fireEvent.keyDown(first, { key: 'ArrowDown' });
  expect(second).toHaveFocus();
  fireEvent.keyDown(second, { key: 'Enter' });
  expect(onInvoiceSelect).toHaveBeenCalledWith(expect.objectContaining({ invoice_id: 'invoice-2' }));
});
