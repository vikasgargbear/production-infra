import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ReturnBusinessDateGate from './ReturnBusinessDateGate';

it('keeps return sources hidden while the authoritative date is loading', () => {
  render(
    <ReturnBusinessDateGate loading error="" onRetry={jest.fn()}>
      <button type="button">Select invoice</button>
    </ReturnBusinessDateGate>,
  );
  expect(screen.getByRole('status').textContent).toMatch(/loading the authoritative/i);
  expect(screen.queryByRole('button', { name: 'Select invoice' })).toBeNull();
});

it('shows a retryable failure without exposing return sources', () => {
  const retry = jest.fn();
  render(
    <ReturnBusinessDateGate loading={false} error="Business clock unavailable" onRetry={retry}>
      <button type="button">Select invoice</button>
    </ReturnBusinessDateGate>,
  );
  expect(screen.getByRole('alert').textContent).toContain('Business clock unavailable');
  expect(screen.queryByRole('button', { name: 'Select invoice' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry organization date' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

it('reveals return sources only after the date authority succeeds', () => {
  render(
    <ReturnBusinessDateGate loading={false} error="" onRetry={jest.fn()}>
      <button type="button">Select invoice</button>
    </ReturnBusinessDateGate>,
  );
  expect(screen.getByRole('button', { name: 'Select invoice' })).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});
