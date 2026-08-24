import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Package, ShoppingCart } from 'lucide-react';
import { SidebarProvider } from '../../../contexts/SidebarContext';
import ModuleHub from './ModuleHub';

const SalesReturn = () => <h1>Sales return content</h1>;
const PurchaseReturn = () => <h1>Purchase return content</h1>;

const TestHub = ({ renderVersion }: { renderVersion: number }) => {
  const modules = [
    {
      id: 'sales-return',
      fullLabel: 'Sales Return',
      icon: ShoppingCart,
      color: 'red',
      component: SalesReturn,
    },
    {
      id: 'purchase-return',
      fullLabel: 'Purchase Return',
      icon: Package,
      color: 'orange',
      component: PurchaseReturn,
    },
  ];

  return (
    <div data-render-version={renderVersion}>
      <ModuleHub
        title="Returns"
        modules={modules}
        defaultModule="sales-return"
        onClose={() => undefined}
      />
    </div>
  );
};

describe('ModuleHub active module stability', () => {
  it('does not reset to the default when a parent recreates an equivalent module array', () => {
    const { rerender } = render(
      <SidebarProvider>
        <TestHub renderVersion={1} />
      </SidebarProvider>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Purchase Return' })[0]);
    expect(screen.getByRole('heading', { name: 'Purchase return content' })).toBeTruthy();

    rerender(
      <SidebarProvider>
        <TestHub renderVersion={2} />
      </SidebarProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Purchase return content' })).toBeTruthy();
  });
});
