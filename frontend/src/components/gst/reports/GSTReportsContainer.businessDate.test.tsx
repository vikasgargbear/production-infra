import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GSTReportsContainer from './GSTReportsContainer';

const mockGstr1 = jest.fn(() => <div>Canonical GST report</div>);

jest.mock('../../../hooks/useCanonicalBusinessDate', () => ({
  useCanonicalBusinessDate: () => ({
    businessDate: '',
    organizationTimezone: '',
    loading: false,
    error: 'Business clock unavailable.',
  }),
}));

jest.mock('../../global', () => ({
  DatePicker: ({ placeholder, onChange }: { placeholder: string; onChange: (value: Date) => void }) => (
    <button
      type="button"
      onClick={() => onChange(new Date(2026, 7, placeholder === 'From' ? 1 : 25))}
    >
      {placeholder}
    </button>
  ),
}));

jest.mock('../../global/ui/ModuleHeader', () => () => <div>GST Reports</div>);
jest.mock('../hooks/useGSTExport', () => ({ useGSTExport: () => ({ exportToCSV: jest.fn() }) }));
jest.mock('./GSTR1Report', () => (props: unknown) => mockGstr1(props));
jest.mock('./GSTR2BReport', () => () => null);
jest.mock('./GSTR3BReport', () => () => null);
jest.mock('./HSNSummaryReport', () => () => null);
jest.mock('./PartyWiseReport', () => () => null);

beforeEach(() => mockGstr1.mockClear());

it('requires an explicit valid range when the organization business clock fails', async () => {
  render(<GSTReportsContainer />);

  expect((await screen.findByRole('alert')).textContent).toMatch(/business clock unavailable/i);
  expect(mockGstr1).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'From' }));
  fireEvent.click(screen.getByRole('button', { name: 'To' }));

  await waitFor(() => expect(mockGstr1).toHaveBeenCalledWith(expect.objectContaining({
    dateRange: { from: '2026-08-01', to: '2026-08-25' },
  })));
});
