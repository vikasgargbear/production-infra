/**
 * OutstandingTable Component
 * Party list with net positions and allocation actions
 * Optimized with React.memo
 */

import React from 'react';
import { formatExactCurrency } from '../../../../utils/exactDecimal';
import type { OutstandingTableProps } from '../types/outstanding.types';
import { hasPositiveMoney } from '../canonicalLedgerProjection';

export const OutstandingTable = React.memo<OutstandingTableProps>(({
    parties,
    partyType,
    onPartyClick
}) => {
    if (parties.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                No matching records found
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm">
            <table className="w-full">
                <thead className="bg-gray-50 border-b">
                    <tr>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {partyType === 'customer' ? 'Customer' : 'Supplier'}
                        </th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Net Position
                        </th>
                        <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                        </th>
                        <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {parties.map((party) => {
                        return (
                            <tr
                                key={party.party_id}
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => onPartyClick(party)}
                            >
                                <td className="px-6 py-3">
                                    <div className="font-medium">{party.party_name}</div>
                                </td>
                                <td className="px-6 py-3 text-right">
                                    <div className="font-semibold text-red-600">
                                        {formatExactCurrency(party.total_outstanding, 'Party outstanding')}
                                        <span className="ml-1 text-xs">
                                            Due
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-center">
                                    {hasPositiveMoney(party.total_overdue, 'Party overdue') ? (
                                        <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">
                                            Overdue
                                        </span>
                                    ) : (
                                        <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">
                                            Current
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-3 text-center">
                                    <button
                                        type="button"
                                        disabled
                                        title="Payment allocation requires the canonical customer-receipt command"
                                        className="cursor-not-allowed rounded border border-gray-200 bg-gray-100 px-3 py-2 text-xs text-gray-500"
                                    >
                                        Allocation unavailable
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
});

OutstandingTable.displayName = 'OutstandingTable';
