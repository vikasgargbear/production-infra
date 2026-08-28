import React from 'react';
import { render, screen } from '@testing-library/react';
import RoleManagement from './RoleManagement';

describe('canonical admin unavailable surfaces', () => {
  it('does not present legacy role CRUD controls', () => {
    render(<RoleManagement open onClose={jest.fn()} />);

    expect(screen.getByText('No role request was sent')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /create|setup|edit|delete|assign/i })).toBeNull();
  });
});
