import React from 'react';
import { render, screen } from '@testing-library/react';
import ContactActions from './ContactActions';

test('renders explicit, accessible contact destinations without invoking them', () => {
  render(
    <ContactActions
      name="Canonical Buyer"
      phone="+91 98765-43210"
      email="buyer@example.com"
      whatsapp="98765 43210"
    />
  );

  expect(screen.getByRole('link', { name: 'Call Canonical Buyer' }).getAttribute('href')).toBe(
    'tel:+919876543210'
  );
  expect(screen.getByRole('link', { name: 'Email Canonical Buyer' }).getAttribute('href')).toBe(
    'mailto:buyer%40example.com'
  );
  expect(screen.getByRole('link', { name: 'Open WhatsApp for Canonical Buyer' }).getAttribute('href')).toBe(
    'https://wa.me/919876543210'
  );
});

test('does not render dead controls when contact data is absent', () => {
  render(<ContactActions name="No Contact" />);

  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByText('No contact details')).not.toBeNull();
});
