import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import ConvertToInvoiceButton from './ConvertToInvoiceButton';

describe('ConvertToInvoiceButton canonical boundary', () => {
  it('fails closed and directs UUID orders to the reviewed invoice workflow', () => {
    render(<ConvertToInvoiceButton
      orderId="0198ea37-2b22-7c8d-9123-123456789abc"
      orderNumber="SO-004"
    />);

    const button = screen.getByRole('button', {
      name: 'Create invoice for sales order SO-004 from the canonical invoice workflow',
    });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Use Create Invoice');
    expect(screen.getByTitle(/canonical batch and dispatch review/)).toBeInTheDocument();
  });
});
