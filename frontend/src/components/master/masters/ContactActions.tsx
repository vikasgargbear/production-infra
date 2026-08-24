import React from 'react';
import { Mail, Phone } from 'lucide-react';
import WhatsAppIcon from '../../icons/WhatsAppIcon';

interface ContactActionsProps {
  name: string;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
}

const phoneHref = (value: string): string => `tel:${value.replace(/[^+\d]/g, '')}`;
const whatsappHref = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  const international = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${international}`;
};

/** Explicit contact links. They never send a message or make a call automatically. */
const ContactActions: React.FC<ContactActionsProps> = ({ name, phone, email, whatsapp }) => (
  <div className="flex items-center gap-1" aria-label={`Contact ${name}`}>
    {phone && (
      <a
        href={phoneHref(phone)}
        aria-label={`Call ${name}`}
        title={`Call ${phone}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <Phone className="h-4 w-4" aria-hidden="true" />
      </a>
    )}
    {email && (
      <a
        href={`mailto:${encodeURIComponent(email)}`}
        aria-label={`Email ${name}`}
        title={`Email ${email}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
      </a>
    )}
    {whatsapp && (
      <a
        href={whatsappHref(whatsapp)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open WhatsApp for ${name}`}
        title={`Open WhatsApp for ${whatsapp}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-gray-200 bg-white text-green-600 hover:border-green-200 hover:bg-green-50 hover:text-green-700"
      >
        <WhatsAppIcon className="h-4 w-4" />
      </a>
    )}
    {!phone && !email && !whatsapp && <span className="text-sm text-gray-400">No contact details</span>}
  </div>
);

export default ContactActions;
