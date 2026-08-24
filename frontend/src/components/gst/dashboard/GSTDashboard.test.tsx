import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { gstApi } from '../../../services/api';
import GSTDashboard from './GSTDashboard';

jest.mock('../../../services/api', () => ({
  gstApi: { dashboard: { getSummary: jest.fn() } },
}));

jest.mock('../../global/ui/ModuleHeader', () => () => <div>GST Dashboard</div>);
jest.mock('../../global/ui/display/SummaryCard', () => ({ title }: { title: string }) => <div>{title}</div>);

describe('GSTDashboard periods', () => {
  it('reloads the selected server-bounded period and shows its exact dates', async () => {
    (gstApi.dashboard.getSummary as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          period: { key: 'current', start: '2026-08-01', end: '2026-08-24' },
          outputTax: 12,
          inputCredit: 5,
          netPayable: 7,
          summary: {},
        },
      })
      .mockResolvedValueOnce({
        data: {
          period: { key: 'previous', start: '2026-07-01', end: '2026-07-31' },
          outputTax: 3,
          inputCredit: 1,
          netPayable: 2,
          summary: {},
        },
      });

    render(<GSTDashboard />);

    expect(await screen.findByText('1 Aug 2026 – 24 Aug 2026')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'GST reporting period' }), {
      target: { value: 'previous' },
    });

    await waitFor(() => expect(gstApi.dashboard.getSummary).toHaveBeenLastCalledWith('previous'));
    expect(await screen.findByText('1 Jul 2026 – 31 Jul 2026')).toBeTruthy();
  });
});
