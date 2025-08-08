import React from 'react';

interface Party {
  id?: string;
  name?: string;
  party_name?: string;
  customer_name?: string;
  supplier_name?: string;
  code?: string;
  party_code?: string;
  type?: 'customer' | 'supplier';
  gstin?: string;
  pan?: string;
  contact_person?: string;
  contact?: string;
  phone?: string;
  alt_phone?: string;
  altPhone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  credit_limit?: number;
  credit_days?: number;
  default_discount?: number;
  place_of_supply?: string;
  tags?: string[];
  notes?: string;
  [key: string]: any;
}

interface PartyEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  party?: Party | null | undefined;
  partyType?: 'customer' | 'supplier';
  onSave?: (party: Party) => void;
  mode?: 'edit' | 'create' | 'view';
}

declare const PartyEditModal: React.FC<PartyEditModalProps>;

export default PartyEditModal;