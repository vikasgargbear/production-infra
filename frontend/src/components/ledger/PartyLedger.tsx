/**
 * PartyLedger Component
 * Main entry point for party ledger functionality - routes to appropriate version
 */

import React, { useState } from 'react';
import { Settings, ToggleLeft, ToggleRight } from 'lucide-react';
import PartyLedgerV2 from './PartyLedgerV2';
import PartyLedgerV3 from './PartyLedgerV3';

interface PartyLedgerProps {
  partyType?: 'customer' | 'supplier';
  partyId?: string;
  embedded?: boolean;
  defaultVersion?: 'v2' | 'v3';
}

const PartyLedger: React.FC<PartyLedgerProps> = ({
  partyType = 'customer',
  partyId,
  embedded = false,
  defaultVersion = 'v3'
}) => {
  const [version, setVersion] = useState<'v2' | 'v3'>(defaultVersion);

  // For embedded mode, directly render the selected version
  if (embedded) {
    return version === 'v3' ? (
      <PartyLedgerV3 
        partyType={partyType}
        partyId={partyId}
        embedded={embedded}
      />
    ) : (
      <PartyLedgerV2 
        partyType={partyType}
        partyId={partyId}
        embedded={embedded}
      />
    );
  }

  return (
    <div className="p-6">
      {/* Version Selector */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Party Ledger</h1>
          <p className="text-gray-600">
            {version === 'v3' 
              ? 'Advanced view with analytics and reconciliation'
              : 'Standard view with transaction history'
            }
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">View Mode:</span>
          <button
            onClick={() => setVersion(version === 'v2' ? 'v3' : 'v2')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            {version === 'v2' ? (
              <>
                <ToggleLeft className="h-5 w-5" />
                <span>Standard</span>
              </>
            ) : (
              <>
                <ToggleRight className="h-5 w-5" />
                <span>Advanced</span>
              </>
            )}
          </button>
          <button className="p-2 text-gray-500 hover:text-gray-700">
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Render Selected Version */}
      {version === 'v3' ? (
        <PartyLedgerV3 
          partyType={partyType}
          partyId={partyId}
          embedded={false}
        />
      ) : (
        <PartyLedgerV2 
          partyType={partyType}
          partyId={partyId}
          embedded={false}
        />
      )}
    </div>
  );
};

export default PartyLedger;