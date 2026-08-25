import React, { useEffect, useState } from 'react';
import { AlertCircle, CreditCard, Loader2 } from 'lucide-react';

import { bankAccountsApi } from '../../../services/api';
import type { CanonicalBankAccountRead } from '../../../services/api/modules/master/canonicalMasterReads';
import { CanonicalWriteNotice } from '../../global';

interface BankAccountManagerProps {
    companyData: Record<string, unknown>;
    onUpdate?: (account: CanonicalBankAccountRead) => void;
}

const BankAccountManager: React.FC<BankAccountManagerProps> = () => {
    const [accounts, setAccounts] = useState<CanonicalBankAccountRead[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        bankAccountsApi.getAll()
            .then(response => {
                if (active) setAccounts(response.data.bank_accounts);
            })
            .catch(() => {
                if (!active) return;
                setAccounts([]);
                setError('Unable to load canonical bank accounts.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, []);

    return (
        <section className="border border-gray-200 bg-white p-6" aria-labelledby="bank-account-heading">
            <div className="mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" aria-hidden="true" />
                <h2 id="bank-account-heading" className="text-lg font-semibold text-gray-900">Bank accounts</h2>
            </div>

            <CanonicalWriteNotice
                action="Changing bank accounts, settlement ledgers, UPI IDs, or payment QR codes"
                className="mb-4"
            />

            {loading && (
                <div className="flex min-h-24 items-center justify-center text-sm text-gray-600" role="status">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading bank accounts…
                </div>
            )}

            {error && (
                <div className="flex items-center border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                    <AlertCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                    {error}
                </div>
            )}

            {!loading && !error && accounts.length === 0 && (
                <p className="border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                    No active INR bank account with an active asset settlement ledger is configured.
                </p>
            )}

            {!loading && !error && accounts.length > 0 && (
                <div className="space-y-3">
                    {accounts.map(account => (
                        <article key={account.bank_account_id} className="border border-gray-200 bg-white p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h3 className="font-medium text-gray-900">{account.bank_name}</h3>
                                    <p className="mt-1 text-sm text-gray-600">{account.account_holder_name}</p>
                                </div>
                                <span className="border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                                    {account.currency_code}
                                </span>
                            </div>
                            <dl className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-sm md:grid-cols-2">
                                <div>
                                    <dt className="text-gray-500">IFSC</dt>
                                    <dd className="font-mono text-gray-900">{account.ifsc}</dd>
                                </div>
                                <div>
                                    <dt className="text-gray-500">Settlement ledger</dt>
                                    <dd className="text-gray-900">
                                        {account.settlement_account_code} — {account.settlement_account_name}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-gray-500">Reconciliation</dt>
                                    <dd className="text-gray-900">
                                        {account.allows_bank_reconciliation ? 'Available' : 'Unavailable'}
                                    </dd>
                                </div>
                            </dl>
                            <p className="mt-3 text-xs text-gray-500">
                                Account numbers are protected and are not exposed by this read projection.
                            </p>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
};

export default BankAccountManager;
