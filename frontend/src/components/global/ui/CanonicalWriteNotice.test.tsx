import React from 'react';
import { render, screen } from '@testing-library/react';
import CanonicalWriteNotice from './CanonicalWriteNotice';

describe('CanonicalWriteNotice', () => {
  it('explains that unavailable writes are neither local nor queued', () => {
    render(<CanonicalWriteNotice action="Posting a journal entry" />);

    const text = screen.getByRole('status').textContent || '';
    expect(text).toContain('Read-only live API view');
    expect(text).toContain('Posting a journal entry is disabled');
    expect(text).toContain('Nothing will be saved on this device or queued for later');
  });
});
