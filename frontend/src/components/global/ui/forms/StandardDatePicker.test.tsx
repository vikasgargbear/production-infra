import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import StandardDatePicker from './StandardDatePicker';

test('associates its visible label with the date input', () => {
  const onChange = jest.fn();
  render(<StandardDatePicker label="Expected Delivery" value="2026-08-26" onChange={onChange} />);

  const input = screen.getByLabelText('Expected Delivery') as HTMLInputElement;
  expect(input.value).toBe('2026-08-26');
  fireEvent.change(input, { target: { value: '2026-08-27' } });
  expect(onChange).toHaveBeenCalledWith('2026-08-27');
});
