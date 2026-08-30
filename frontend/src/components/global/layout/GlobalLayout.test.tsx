import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import GlobalLayout from './GlobalLayout';

test.each(['default', 'compact', 'spacious'] as const)(
  '%s layout keeps a bounded independently scrollable content region',
  variant => {
    const { container } = render(
      <GlobalLayout title="Master records" variant={variant}>
        <div>Last master row</div>
      </GlobalLayout>,
    );

    const outer = container.firstElementChild;
    const inner = outer?.firstElementChild;
    const scrollRegion = screen.getByText('Last master row').parentElement?.parentElement?.parentElement;

    expect(outer).toHaveClass('h-full', 'min-h-0', 'overflow-hidden');
    expect(inner).toHaveClass('h-full', 'min-h-0', 'flex-col');
    expect(scrollRegion).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
  },
);
