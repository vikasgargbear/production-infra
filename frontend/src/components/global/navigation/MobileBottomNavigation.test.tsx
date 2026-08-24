import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MobileBottomNavigation from './MobileBottomNavigation';

jest.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ hasModuleAccess: () => true }),
}));

describe('MobileBottomNavigation', () => {
  it('shows five clear primary destinations and marks the active one', () => {
    render(<MobileBottomNavigation activeTab="sales" onNavigate={jest.fn()} />);

    expect(screen.getByRole('navigation', { name: 'Primary mobile navigation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sales' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Purchase' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stock' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy();
  });

  it('navigates from a primary item and exposes the permission-aware More sheet', () => {
    const onNavigate = jest.fn();
    render(<MobileBottomNavigation activeTab="home" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Purchase' }));
    expect(onNavigate).toHaveBeenCalledWith('purchase');

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('region', { name: 'More modules' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Returns' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finance' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'GST' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Master Data' }));
    expect(onNavigate).toHaveBeenCalledWith('master');
  });
});
