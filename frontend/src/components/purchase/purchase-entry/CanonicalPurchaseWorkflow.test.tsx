import { fireEvent, render, screen } from '@testing-library/react';

import CanonicalPurchaseWorkflow from './CanonicalPurchaseWorkflow';

jest.mock('../../global', () => ({
  ModuleHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

describe('CanonicalPurchaseWorkflow', () => {
  it('explains the two authoritative posting boundaries', () => {
    render(<CanonicalPurchaseWorkflow onNavigate={jest.fn()} />);

    expect(screen.getByRole('heading', { name: 'Receive stock, then post the supplier invoice' })).not.toBeNull();
    expect(screen.getByText(/stock and valuation only/i)).not.toBeNull();
    expect(screen.getByText(/supplier payable, GST\/ITC/i)).not.toBeNull();
    expect(screen.queryByText(/save purchase/i)).toBeNull();
  });

  it.each([
    ['Find approved purchase order', 'purchase-history'],
    ['Match supplier invoice', 'supplier-invoice'],
    ['View goods receipts', 'grn'],
  ] as const)('routes %s to %s without submitting a combined write', (name, destination) => {
    const onNavigate = jest.fn();
    render(<CanonicalPurchaseWorkflow onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(name, 'i') }));

    expect(onNavigate).toHaveBeenCalledWith(destination);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
