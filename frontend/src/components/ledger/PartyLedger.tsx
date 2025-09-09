/**
 * PartyLedger Component
 * Main entry point for party ledger functionality - uses V3
 */

import React from 'react';
import PartyLedgerV3 from './PartyLedgerV3';

interface PartyLedgerProps {
  partyType?: 'customer' | 'supplier';
  partyId?: string;
  embedded?: boolean;
  onClose?: () => void;
}

const PartyLedger: React.FC<PartyLedgerProps> = ({
  partyType = 'customer',
  partyId,
  embedded = false,
  onClose
}) => {
  // Always use V3 - V2 has been archived
  return (
    <PartyLedgerV3 
      partyType={partyType}
      partyId={partyId}
      embedded={embedded}
      onClose={onClose}
    />
  );
};

export default PartyLedger;