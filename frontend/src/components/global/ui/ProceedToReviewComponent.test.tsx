import React from 'react';
import { render, screen } from '@testing-library/react';

import ProceedToReviewComponent from './ProceedToReviewComponent';

describe('ProceedToReviewComponent exact amount display', () => {
  it('renders canonical decimal strings without JavaScript number coercion', () => {
    render(
      <ProceedToReviewComponent
        currentStep={2}
        totalAmount="9007199254740993.01"
        onProceed={jest.fn()}
      />,
    );
    expect(screen.getByText('₹9007199254740993.01')).toBeTruthy();
  });

  it('keeps legacy numeric callers formatted to two places', () => {
    render(
      <ProceedToReviewComponent
        currentStep={2}
        totalAmount={168}
        onProceed={jest.fn()}
      />,
    );
    expect(screen.getByText('₹168.00')).toBeTruthy();
  });
});
