import React, { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { useEnterAsTab } from './useEnterAsTab';

const KeyboardForm = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  useEnterAsTab({
    containerRef,
    excludeSelectors: ['button', 'input[type="checkbox"]', '[data-no-enter-tab]'],
  });
  return (
    <div ref={containerRef}>
      <input aria-label="First" />
      <button type="button">Auxiliary action</button>
      <input aria-label="Excluded" data-no-enter-tab />
      <input aria-label="Flag" type="checkbox" />
      <input aria-label="Amount" inputMode="decimal" />
      <select aria-label="Mode"><option>Cash</option></select>
    </div>
  );
};

describe('useEnterAsTab', () => {
  it('moves through operator fields while skipping auxiliary controls', () => {
    render(<KeyboardForm />);
    const first = screen.getByLabelText('First');
    const amount = screen.getByLabelText('Amount');
    const mode = screen.getByLabelText('Mode');

    first.focus();
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(amount).toHaveFocus();

    fireEvent.keyDown(amount, { key: 'Enter' });
    expect(mode).toHaveFocus();
  });

  it('leaves modified Enter available for review and posting shortcuts', () => {
    render(<KeyboardForm />);
    const first = screen.getByLabelText('First');

    first.focus();
    fireEvent.keyDown(first, { key: 'Enter', ctrlKey: true });
    expect(first).toHaveFocus();
  });
});
