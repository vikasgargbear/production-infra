import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PDFUploadModal from './PDFUploadModal';

const mockParseInvoice = jest.fn();
jest.mock('../../../services/api', () => ({
  purchasesApi: { parseInvoice: (...args: unknown[]) => mockParseInvoice(...args) },
}));

test('owns keyboard focus and Escape as an accessible modal', async () => {
  const onClose = jest.fn();
  render(
    <>
      <button>Underlying action</button>
      <PDFUploadModal isOpen onClose={onClose} onDataExtracted={jest.fn()} />
    </>
  );

  expect(screen.getByRole('dialog', { name: 'Upload Purchase Invoice' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Close PDF upload' })).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('rejects a wrong file type before any upload request', () => {
  render(<PDFUploadModal isOpen onClose={jest.fn()} onDataExtracted={jest.fn()} />);
  const input = screen.getByLabelText('Select PDF Invoice');

  fireEvent.change(input, {
    target: { files: [new File(['not pdf'], 'invoice.txt', { type: 'text/plain' })] },
  });

  expect(screen.getByRole('alert').textContent).toContain('Only PDF files are allowed');
  expect(mockParseInvoice).not.toHaveBeenCalled();
});
