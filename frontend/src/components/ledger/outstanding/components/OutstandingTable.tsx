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
        <>
        <div className="space-y-3 md:hidden">
            {parties.map(party => (
                <article key={party.party_account_id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><h3 className="truncate font-semibold text-gray-950">{party.party_name}</h3><p className="mt-0.5 text-xs text-gray-500">{party.party_code}</p></div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${hasPositiveMoney(party.total_overdue, 'Party overdue') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{hasPositiveMoney(party.total_overdue, 'Party overdue') ? 'Overdue' : 'Current'}</span>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xs text-gray-500">Outstanding</p><p className="mt-1 text-lg font-semibold text-red-700">{formatExactCurrency(party.total_outstanding, 'Party outstanding')}</p></div><button type="button" onClick={() => onPartyClick(party)} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">View details</button></div>
                </article>
            ))}
        </div>
        <div className="hidden overflow-x-auto bg-white rounded-lg shadow-sm md:block">
            <table className="min-w-[720px] w-full">
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
                                key={party.party_account_id}
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => onPartyClick(party)}
                            >
                                <td className="px-6 py-3">
                                    <div className="font-medium">{party.party_name}</div>
                                    <div className="mt-0.5 text-xs text-gray-500">{party.party_code}</div>
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
                                        onClick={(event) => { event.stopPropagation(); onPartyClick(party); }}
                                        className="min-h-11 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                    >
                                        View details
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
        </>
    );
});

OutstandingTable.displayName = 'OutstandingTable';
