import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DataTable } from './DataTable';

const rows = [{ id: 'invoice-1', number: 'INV-1001' }];
const columns = [
  { key: 'number', header: 'Invoice', render: (_value: unknown, row: typeof rows[number]) => row.number },
  {
    key: 'action', header: 'Action',
    render: () => <button type="button">Row action</button>,
  },
];

test('activates an accessible row by double-click or Enter without hijacking nested controls', () => {
  const onRowActivate = jest.fn();
  render(<DataTable
    data={rows}
    columns={columns}
    keyField="id"
    onRowActivate={onRowActivate}
    getRowAriaLabel={(row) => `Open invoice ${row.number}`}
  />);

  const row = screen.getByRole('row', { name: 'Open invoice INV-1001' });
  fireEvent.doubleClick(row);
  expect(onRowActivate).toHaveBeenCalledWith(rows[0]);

  fireEvent.keyDown(row, { key: 'Enter' });
  expect(onRowActivate).toHaveBeenCalledTimes(2);

  fireEvent.doubleClick(screen.getByRole('button', { name: 'Row action' }));
  expect(onRowActivate).toHaveBeenCalledTimes(2);
});
