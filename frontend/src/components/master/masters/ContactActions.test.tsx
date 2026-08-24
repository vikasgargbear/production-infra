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

  const call = screen.getByRole('link', { name: 'Call Canonical Buyer' });
  const email = screen.getByRole('link', { name: 'Email Canonical Buyer' });
  const whatsapp = screen.getByRole('link', { name: 'Open WhatsApp for Canonical Buyer' });

  expect(call.getAttribute('href')).toBe(
    'tel:+919876543210'
  );
  expect(email.getAttribute('href')).toBe(
    'mailto:buyer%40example.com'
  );
  expect(whatsapp.getAttribute('href')).toBe(
    'https://wa.me/919876543210'
  );
  [call, email, whatsapp].forEach(link => {
    expect(link.className).toContain('min-h-[44px]');
    expect(link.className).toContain('min-w-[44px]');
  });
});

test('does not render dead controls when contact data is absent', () => {
  render(<ContactActions name="No Contact" />);

  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByText('No contact details')).not.toBeNull();
});
