import React from 'react';
import { Mail, Phone } from 'lucide-react';
import WhatsAppIcon from '../../icons/WhatsAppIcon';

interface ContactActionsProps {
  name: string;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
}

export const indianContactDigits = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  return null;
};

export const canonicalContactEmail = (value: string | null | undefined): string | null => {
  const email = value?.trim();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

/** Explicit contact links. They never send a message or make a call automatically. */
const ContactActions: React.FC<ContactActionsProps> = ({ name, phone, email, whatsapp }) => {
  const phoneDigits = indianContactDigits(phone);
  const whatsappDigits = indianContactDigits(whatsapp);
  const emailAddress = canonicalContactEmail(email);

  return (
  <div className="flex items-center gap-1" aria-label={`Contact ${name}`}>
    {phoneDigits && (
      <a
        href={`tel:+${phoneDigits}`}
        aria-label={`Call ${name}`}
        title={`Call ${phone}`}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <Phone className="h-4 w-4" aria-hidden="true" />
      </a>
    )}
    {emailAddress && (
      <a
        href={`mailto:${encodeURIComponent(emailAddress)}`}
        aria-label={`Email ${name}`}
        title={`Email ${email}`}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
      </a>
    )}
    {whatsappDigits && (
      <a
        href={`https://wa.me/${whatsappDigits}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open WhatsApp for ${name}`}
        title={`Open WhatsApp for ${whatsapp}`}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-gray-200 bg-white text-green-600 hover:border-green-200 hover:bg-green-50 hover:text-green-700"
      >
        <WhatsAppIcon className="h-4 w-4" />
      </a>
    )}
    {!phoneDigits && !emailAddress && !whatsappDigits && <span className="text-sm text-gray-400">No valid contact details</span>}
  </div>
  );
};

export default ContactActions;
