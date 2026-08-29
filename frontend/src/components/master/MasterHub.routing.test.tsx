import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MasterHub from './MasterHub';

jest.mock('../global', () => ({
  ModuleHub: ({ defaultModule, onActiveModuleChange }: any) => (
    <div>
      <span data-testid="active-master">{defaultModule}</span>
      <button onClick={() => onActiveModuleChange?.('warehouse-master')}>Choose locations</button>
    </div>
  ),
}));
jest.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, hasCapability: () => true }),
}));
jest.mock('./settings/CompanyProfile', () => () => null);
jest.mock('./masters/ProductMaster', () => () => null);
jest.mock('./masters/CustomerMaster', () => () => null);
jest.mock('./masters/SupplierMaster', () => () => null);
jest.mock('./settings/UserManagement', () => () => null);
jest.mock('./settings/RoleManagement', () => () => null);
jest.mock('./masters/TaxMaster', () => () => null);
jest.mock('./masters/UnitMaster', () => () => null);
jest.mock('./masters/WarehouseMaster', () => () => null);
describe('MasterHub hash subpage contract', () => {
  it('uses a valid deep-linked subpage and reports user navigation', async () => {
    const onSubpageChange = jest.fn();
    const { rerender } = render(
      <MasterHub initialSubpage="customer-master" onSubpageChange={onSubpageChange} />,
    );

    expect(screen.getByTestId('active-master').textContent).toBe('customer-master');
    fireEvent.click(screen.getByRole('button', { name: 'Choose locations' }));
    expect(onSubpageChange).toHaveBeenCalledWith('warehouse-master');

    rerender(<MasterHub initialSubpage="company-profile" onSubpageChange={onSubpageChange} />);
    await waitFor(() => {
      expect(screen.getByTestId('active-master').textContent).toBe('company-profile');
    });
  });

  it('fails closed to the product master for unsupported subpages', () => {
    render(<MasterHub initialSubpage="legacy-settings" />);
    expect(screen.getByTestId('active-master').textContent).toBe('product-master');
  });
});
