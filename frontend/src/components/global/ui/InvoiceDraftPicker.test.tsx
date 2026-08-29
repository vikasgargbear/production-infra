import { fireEvent, render, screen } from '@testing-library/react';

import InvoiceDraftPicker from './InvoiceDraftPicker';

const preparedDraft = {
  draft_id: '10000000-0000-7000-8000-000000000001',
  document_kind: 'sales_invoice' as const,
  branch_id: '10000000-0000-7000-8000-000000000002',
  title: 'Prepared customer invoice',
  payload: {},
  status: 'prepared' as const,
  created_via: 'mcp' as const,
  row_version: 4,
  prepared_command_request_id: '10000000-0000-7000-8000-000000000003',
  posted_resource_id: null,
  created_at: '2026-08-29T00:00:00Z',
  updated_at: '2026-08-29T00:00:00Z',
};

it('keeps a prepared ChatGPT draft discoverable and reopenable', () => {
  const onOpen = jest.fn();
  render(<InvoiceDraftPicker open title="Drafts" drafts={[preparedDraft]} loading={false} onClose={jest.fn()} onOpen={onOpen} onAbandon={jest.fn()} />);
  expect(screen.getByText('Prepared customer invoice')).toBeTruthy();
  expect(screen.getByText(/Prepared in ChatGPT/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open draft' }));
  expect(onOpen).toHaveBeenCalledWith(preparedDraft);
});
