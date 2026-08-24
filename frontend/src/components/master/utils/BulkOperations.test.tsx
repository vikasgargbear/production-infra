import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BulkOperations from './BulkOperations';

describe('BulkOperations', () => {
  it('fails closed without simulated upload, export, progress, or success controls', () => {
    render(<BulkOperations open onClose={jest.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Bulk Operations' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Import / export unavailable' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText(/upload/i)).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText(/No file will be uploaded/i)).toBeTruthy();
  });

  it('closes on Escape before the underlying module handles the key', () => {
    const onClose = jest.fn();
    render(<BulkOperations open onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
