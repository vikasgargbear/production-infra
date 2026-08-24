import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GSTHub from './GSTHub';

jest.mock('../global', () => ({
  ModuleHub: ({ defaultModule, onActiveModuleChange }: any) => (
    <div>
      <span data-testid="active-gst">{defaultModule}</span>
      <button onClick={() => onActiveModuleChange?.('gst-reports')}>Choose reports</button>
    </div>
  ),
}));
jest.mock('./dashboard', () => ({ GSTDashboard: () => null }));
jest.mock('./reports', () => ({ GSTReports: () => null }));

describe('GSTHub hash subpage contract', () => {
  it('uses a valid deep-linked subpage and reports user navigation', async () => {
    const onSubpageChange = jest.fn();
    const { rerender } = render(
      <GSTHub initialSubpage="gst-reports" onSubpageChange={onSubpageChange} />,
    );

    expect(screen.getByTestId('active-gst').textContent).toBe('gst-reports');
    fireEvent.click(screen.getByRole('button', { name: 'Choose reports' }));
    expect(onSubpageChange).toHaveBeenCalledWith('gst-reports');

    rerender(<GSTHub initialSubpage="gst-dashboard" onSubpageChange={onSubpageChange} />);
    await waitFor(() => {
      expect(screen.getByTestId('active-gst').textContent).toBe('gst-dashboard');
    });
  });

  it('fails closed to the GST dashboard for unsupported subpages', () => {
    render(<GSTHub initialSubpage="gstr-legacy" />);
    expect(screen.getByTestId('active-gst').textContent).toBe('gst-dashboard');
  });
});
