import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LedgerHub from './LedgerHub';

jest.mock('../global', () => ({
  ModuleHub: ({ defaultModule, onActiveModuleChange }: any) => (
    <div>
      <span data-testid="active-ledger">{defaultModule}</span>
      <button onClick={() => onActiveModuleChange?.('outstanding')}>Choose outstanding</button>
    </div>
  ),
}));
jest.mock('./PartyLedger', () => () => null);
jest.mock('./Outstanding', () => () => null);
jest.mock('./CollectionCenter', () => () => null);

describe('LedgerHub hash subpage contract', () => {
  it('uses a valid deep-linked subpage and reports user navigation', async () => {
    const onSubpageChange = jest.fn();
    const { rerender } = render(
      <LedgerHub initialSubpage="outstanding" onSubpageChange={onSubpageChange} />,
    );

    expect(screen.getByTestId('active-ledger').textContent).toBe('outstanding');
    fireEvent.click(screen.getByRole('button', { name: 'Choose outstanding' }));
    expect(onSubpageChange).toHaveBeenCalledWith('outstanding');

    rerender(<LedgerHub initialSubpage="collection-center" onSubpageChange={onSubpageChange} />);
    await waitFor(() => {
      expect(screen.getByTestId('active-ledger').textContent).toBe('collection-center');
    });
  });

  it('fails closed to the party statement for unsupported subpages', () => {
    render(<LedgerHub initialSubpage="legacy-ledger" />);
    expect(screen.getByTestId('active-ledger').textContent).toBe('party-statement');
  });
});
